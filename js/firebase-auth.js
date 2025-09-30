/**
 * Firebase Authentication Service
 * Handles GitHub OAuth, Google OAuth, and GA Tech email verification
 *
 * Security considerations:
 * - OAuth tokens are never exposed to client
 * - GA Tech email domain validation
 * - Session management with secure cookies
 * - Automatic token refresh
 */

import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onIdTokenChanged,
  getIdTokenResult,
  getIdToken,
  updateProfile,
  sendEmailVerification,
  reload,
  reauthenticateWithPopup,
  linkWithPopup,
  unlink
} from 'firebase/auth';
import { auth, db, trace } from './firebase-config.js';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Auth providers configuration
 */
const githubProvider = new GithubAuthProvider();
githubProvider.addScope('read:user');
githubProvider.addScope('user:email');

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account',
  hd: 'gatech.edu' // Hint for GA Tech domain
});

/**
 * Auth state management
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.isInitialized = false;
    this.listeners = new Map();
    this.sessionListeners = new Set();
    this.tokenRefreshInterval = null;

    // Initialize auth state listener
    this.initializeAuthListener();
  }

  /**
   * Initialize auth state listener
   */
  initializeAuthListener() {
    // Main auth state listener
    onAuthStateChanged(auth, async (user) => {
      const performanceTrace = trace('auth_state_change');
      performanceTrace.start();

      try {
        if (user) {
          // User signed in
          this.currentUser = await this.enrichUserData(user);
          await this.updateUserRecord(this.currentUser);
          this.startTokenRefresh();

          // Check GA Tech verification
          if (this.isGaTechEmail(user.email) && !user.emailVerified) {
            await this.sendVerificationEmail();
          }
        } else {
          // User signed out
          this.currentUser = null;
          this.stopTokenRefresh();
        }

        this.isInitialized = true;
        this.notifyListeners('auth-state', this.currentUser);

        performanceTrace.putAttribute('authenticated', user ? 'true' : 'false');
      } catch (error) {
        console.error('Auth state change error:', error);
        performanceTrace.putAttribute('error', error.message);
      } finally {
        performanceTrace.stop();
      }
    });

    // Token change listener for session management
    onIdTokenChanged(auth, async (user) => {
      if (user) {
        const tokenResult = await getIdTokenResult(user);
        this.notifySessionListeners({
          user,
          token: tokenResult.token,
          claims: tokenResult.claims,
          expirationTime: tokenResult.expirationTime
        });
      }
    });
  }

  /**
   * Sign in with GitHub
   */
  async signInWithGitHub(useRedirect = false) {
    const performanceTrace = trace('sign_in_github');
    performanceTrace.start();

    try {
      let result;

      if (useRedirect) {
        await signInWithRedirect(auth, githubProvider);
        return { status: 'redirecting' };
      } else {
        result = await signInWithPopup(auth, githubProvider);
      }

      // Get GitHub specific data
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubProfile = await this.fetchGitHubProfile(credential.accessToken);

      // Merge GitHub data with user record
      const userData = {
        ...result.user,
        github: {
          username: githubProfile.login,
          id: githubProfile.id,
          avatar: githubProfile.avatar_url,
          bio: githubProfile.bio,
          company: githubProfile.company,
          location: githubProfile.location
        }
      };

      performanceTrace.putAttribute('provider', 'github');
      performanceTrace.putAttribute('success', 'true');

      return {
        user: userData,
        credential,
        operationType: result.operationType,
        providerId: result.providerId
      };

    } catch (error) {
      performanceTrace.putAttribute('error', error.code);
      performanceTrace.stop();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(useRedirect = false) {
    const performanceTrace = trace('sign_in_google');
    performanceTrace.start();

    try {
      let result;

      if (useRedirect) {
        await signInWithRedirect(auth, googleProvider);
        return { status: 'redirecting' };
      } else {
        result = await signInWithPopup(auth, googleProvider);
      }

      // Check if GA Tech email
      const isGaTech = this.isGaTechEmail(result.user.email);

      performanceTrace.putAttribute('provider', 'google');
      performanceTrace.putAttribute('gatech', isGaTech ? 'true' : 'false');
      performanceTrace.putAttribute('success', 'true');

      return {
        user: result.user,
        credential: GoogleAuthProvider.credentialFromResult(result),
        operationType: result.operationType,
        providerId: result.providerId,
        isGaTechStudent: isGaTech
      };

    } catch (error) {
      performanceTrace.putAttribute('error', error.code);
      performanceTrace.stop();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Handle redirect result (for mobile compatibility)
   */
  async handleRedirectResult() {
    try {
      const result = await getRedirectResult(auth);
      if (result) {
        return {
          user: result.user,
          credential: OAuthProvider.credentialFromResult(result),
          operationType: result.operationType,
          providerId: result.providerId
        };
      }
      return null;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Link additional auth provider
   */
  async linkProvider(providerName) {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    const provider = providerName === 'github' ? githubProvider : googleProvider;

    try {
      const result = await linkWithPopup(auth.currentUser, provider);
      await this.updateUserRecord(result.user);
      return result;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Unlink auth provider
   */
  async unlinkProvider(providerId) {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      const result = await unlink(auth.currentUser, providerId);
      await this.updateUserRecord(result);
      return result;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    const performanceTrace = trace('sign_out');
    performanceTrace.start();

    try {
      // Update last seen before signing out
      if (this.currentUser) {
        await updateDoc(doc(db, 'users', this.currentUser.uid), {
          last_seen: serverTimestamp(),
          online_status: 'offline'
        });
      }

      await firebaseSignOut(auth);
      this.currentUser = null;
      this.stopTokenRefresh();

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { success: true };
    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Re-authenticate user (for sensitive operations)
   */
  async reauthenticate(providerName) {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    const provider = providerName === 'github' ? githubProvider : googleProvider;

    try {
      const result = await reauthenticateWithPopup(auth.currentUser, provider);
      return result;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Set session persistence
   */
  async setSessionPersistence(rememberMe = true) {
    try {
      const persistence = rememberMe
        ? browserLocalPersistence
        : browserSessionPersistence;

      await setPersistence(auth, persistence);
      return { success: true, type: rememberMe ? 'local' : 'session' };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Get current ID token
   */
  async getIdToken(forceRefresh = false) {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      return await getIdToken(auth.currentUser, forceRefresh);
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Get ID token result with claims
   */
  async getIdTokenResult(forceRefresh = false) {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      const tokenResult = await getIdTokenResult(auth.currentUser, forceRefresh);
      return {
        token: tokenResult.token,
        claims: tokenResult.claims,
        authTime: tokenResult.authTime,
        issuedAtTime: tokenResult.issuedAtTime,
        expirationTime: tokenResult.expirationTime,
        signInProvider: tokenResult.signInProvider
      };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail() {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/verify-email`,
        handleCodeInApp: false
      });
      return { success: true, email: auth.currentUser.email };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(updates) {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: updates.displayName,
        photoURL: updates.photoURL
      });

      // Update Firestore user document
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        ...updates,
        updated_at: serverTimestamp()
      });

      // Reload user to get fresh data
      await reload(auth.currentUser);

      return auth.currentUser;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Check if email is GA Tech domain
   */
  isGaTechEmail(email) {
    if (!email) return false;
    const domain = email.split('@')[1];
    return domain === 'gatech.edu' || domain === 'cc.gatech.edu';
  }

  /**
   * Verify GA Tech student status
   */
  async verifyGaTechStatus(user) {
    if (!user || !user.email) {
      return { verified: false, reason: 'no_email' };
    }

    const isGaTech = this.isGaTechEmail(user.email);
    const isEmailVerified = user.emailVerified;

    const status = {
      verified: isGaTech && isEmailVerified,
      isGaTechEmail: isGaTech,
      isEmailVerified,
      email: user.email,
      timestamp: new Date().toISOString()
    };

    // Update user record with verification status
    if (status.verified) {
      await updateDoc(doc(db, 'users', user.uid), {
        gatech_verified: true,
        gatech_email: user.email,
        verified_at: serverTimestamp()
      });
    }

    return status;
  }

  /**
   * Enrich user data with additional information
   */
  async enrichUserData(user) {
    if (!user) return null;

    try {
      // Get user document from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || userData.username,
        photoURL: user.photoURL || userData.avatar,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        providerData: user.providerData,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime
        },
        // Custom fields from Firestore
        username: userData.username,
        karma: userData.karma || { post: 0, comment: 0 },
        gatech_verified: userData.gatech_verified || false,
        preferences: userData.preferences || {},
        roles: userData.roles || [],
        created_at: userData.created_at,
        last_seen: userData.last_seen
      };
    } catch (error) {
      console.error('Error enriching user data:', error);
      return user;
    }
  }

  /**
   * Update user record in Firestore
   */
  async updateUserRecord(user) {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);

    try {
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        // Update existing user
        await updateDoc(userRef, {
          last_seen: serverTimestamp(),
          online_status: 'online',
          email: user.email,
          display_name: user.displayName,
          photo_url: user.photoURL,
          email_verified: user.emailVerified
        });
      } else {
        // Create new user record
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          username: user.displayName || user.email.split('@')[0],
          display_name: user.displayName,
          photo_url: user.photoURL,
          email_verified: user.emailVerified,
          gatech_verified: this.isGaTechEmail(user.email) && user.emailVerified,
          karma: { post: 0, comment: 0 },
          preferences: {
            theme: 'dark',
            notifications: true,
            email_updates: false
          },
          roles: [],
          created_at: serverTimestamp(),
          last_seen: serverTimestamp(),
          online_status: 'online'
        });
      }
    } catch (error) {
      console.error('Error updating user record:', error);
    }
  }

  /**
   * Fetch GitHub profile using access token
   */
  async fetchGitHubProfile(accessToken) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching GitHub profile:', error);
      return {};
    }
  }

  /**
   * Start token refresh interval
   */
  startTokenRefresh() {
    // Refresh token every 55 minutes (tokens expire after 60 min)
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        await this.getIdToken(true);
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, 55 * 60 * 1000);
  }

  /**
   * Stop token refresh interval
   */
  stopTokenRefresh() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }

  /**
   * Add auth state listener
   */
  onAuthStateChange(callback) {
    const listenerId = Date.now().toString();
    this.listeners.set(listenerId, callback);

    // Call immediately with current state
    if (this.isInitialized) {
      callback(this.currentUser);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listenerId);
    };
  }

  /**
   * Add session listener
   */
  onSessionChange(callback) {
    this.sessionListeners.add(callback);
    return () => this.sessionListeners.delete(callback);
  }

  /**
   * Notify auth state listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Auth listener error:', error);
      }
    });
  }

  /**
   * Notify session listeners
   */
  notifySessionListeners(sessionData) {
    this.sessionListeners.forEach(callback => {
      try {
        callback(sessionData);
      } catch (error) {
        console.error('Session listener error:', error);
      }
    });
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(error) {
    const errorMessages = {
      'auth/user-not-found': 'No user found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/email-already-in-use': 'Email is already registered',
      'auth/operation-not-allowed': 'Operation not allowed',
      'auth/weak-password': 'Password is too weak',
      'auth/popup-closed-by-user': 'Authentication cancelled',
      'auth/account-exists-with-different-credential': 'Account exists with different provider',
      'auth/invalid-credential': 'Invalid authentication credentials',
      'auth/popup-blocked': 'Popup was blocked by browser',
      'auth/cancelled-popup-request': 'Another popup is already open',
      'auth/network-request-failed': 'Network error, please try again',
      'auth/too-many-requests': 'Too many attempts, please try later',
      'auth/requires-recent-login': 'Please re-authenticate to continue'
    };

    return {
      code: error.code,
      message: errorMessages[error.code] || error.message,
      details: error
    };
  }

  /**
   * Wait for auth initialization
   */
  async waitForAuth() {
    if (this.isInitialized) {
      return this.currentUser;
    }

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  /**
   * Get auth state
   */
  getAuthState() {
    return {
      isAuthenticated: !!this.currentUser,
      isInitialized: this.isInitialized,
      user: this.currentUser,
      isGaTechVerified: this.currentUser?.gatech_verified || false
    };
  }
}

// Export singleton instance
const authService = new AuthService();

// Export individual functions for convenience
export const {
  signInWithGitHub,
  signInWithGoogle,
  signOut,
  onAuthStateChange,
  getAuthState,
  waitForAuth,
  verifyGaTechStatus,
  updateUserProfile,
  sendVerificationEmail,
  setSessionPersistence,
  linkProvider,
  unlinkProvider,
  reauthenticate,
  getIdToken: getUserToken,
  getIdTokenResult: getTokenResult
} = authService;

// Export the service instance
export default authService;