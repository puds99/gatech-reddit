/**
 * Supabase Authentication Service
 * Handles GitHub OAuth, Google OAuth, and GA Tech email verification
 *
 * Security considerations:
 * - OAuth tokens are never exposed to client
 * - GA Tech email domain validation
 * - Session management with secure cookies
 * - Automatic token refresh
 */

import { auth, db, trace, handleSupabaseError, sessionManager } from './supabase-config.js';

/**
 * Auth state management
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.isInitialized = false;
    this.listeners = new Map();
    this.sessionListeners = new Set();

    // Initialize auth state listener
    this.initializeAuthListener();
  }

  /**
   * Initialize auth state listener
   */
  initializeAuthListener() {
    // Main auth state listener
    auth.onAuthStateChange(async (event, session) => {
      const performanceTrace = trace('auth_state_change');
      performanceTrace.start();

      try {
        if (session?.user) {
          // User signed in
          this.currentUser = await this.enrichUserData(session.user);
          await this.updateUserRecord(this.currentUser);

          // Check GA Tech verification
          if (this.isGaTechEmail(session.user.email) && !session.user.email_confirmed_at) {
            await this.sendVerificationEmail();
          }
        } else {
          // User signed out
          this.currentUser = null;
        }

        this.isInitialized = true;
        this.notifyListeners('auth-state', this.currentUser);
        this.notifySessionListeners({
          event,
          session,
          user: this.currentUser
        });

        performanceTrace.putAttribute('authenticated', session ? 'true' : 'false');
        performanceTrace.putAttribute('event', event);
      } catch (error) {
        console.error('Auth state change error:', error);
        performanceTrace.putAttribute('error', error.message);
      } finally {
        performanceTrace.stop();
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
      const { data, error } = await auth.signInWithOAuth({
        provider: 'github',
        options: {
          scopes: 'read:user user:email',
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: !useRedirect
        }
      });

      if (error) throw error;

      performanceTrace.putAttribute('provider', 'github');
      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      if (useRedirect) {
        return { status: 'redirecting', url: data.url };
      }

      // For popup flow, wait for the session
      const { data: { session } } = await auth.getSession();

      if (session) {
        // Fetch additional GitHub data from user metadata
        const userData = {
          ...session.user,
          github: {
            username: session.user.user_metadata?.user_name,
            avatar: session.user.user_metadata?.avatar_url,
            name: session.user.user_metadata?.full_name
          }
        };

        return {
          user: userData,
          session,
          provider: 'github'
        };
      }

      return null;

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
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
      const { data, error } = await auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'profile email',
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: !useRedirect,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            hd: 'gatech.edu' // Hint for GA Tech domain
          }
        }
      });

      if (error) throw error;

      const isGaTech = data.user ? this.isGaTechEmail(data.user.email) : false;

      performanceTrace.putAttribute('provider', 'google');
      performanceTrace.putAttribute('gatech', isGaTech ? 'true' : 'false');
      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      if (useRedirect) {
        return { status: 'redirecting', url: data.url };
      }

      // For popup flow, wait for the session
      const { data: { session } } = await auth.getSession();

      if (session) {
        return {
          user: session.user,
          session,
          provider: 'google',
          isGaTechStudent: this.isGaTechEmail(session.user.email)
        };
      }

      return null;

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Handle OAuth callback (for redirect flow)
   */
  async handleOAuthCallback() {
    try {
      const { data: { session }, error } = await auth.getSession();

      if (error) throw error;

      if (session) {
        return {
          user: session.user,
          session,
          provider: session.user.app_metadata.provider
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

    try {
      const { data, error } = await auth.linkIdentity({
        provider: providerName,
        options: {
          scopes: providerName === 'github' ? 'read:user user:email' : 'profile email',
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) throw error;

      await this.updateUserRecord(this.currentUser);
      return data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Unlink auth provider
   */
  async unlinkProvider(identity) {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      const { data, error } = await auth.unlinkIdentity(identity);

      if (error) throw error;

      await this.updateUserRecord(this.currentUser);
      return data;
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
        await db.from('users').update({
          last_seen: new Date().toISOString(),
          online_status: 'offline'
        }).eq('id', this.currentUser.id);
      }

      const { error } = await auth.signOut();
      if (error) throw error;

      this.currentUser = null;

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

    try {
      const { data, error } = await auth.reauthenticate();

      if (error) throw error;

      return data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Get current session
   */
  async getSession() {
    try {
      const { data: { session }, error } = await auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Get current ID token
   */
  async getIdToken(forceRefresh = false) {
    try {
      if (forceRefresh) {
        await auth.refreshSession();
      }

      const { data: { session }, error } = await auth.getSession();
      if (error) throw error;

      return session?.access_token;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail() {
    try {
      const { data, error } = await auth.resend({
        type: 'signup',
        email: this.currentUser.email,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`
        }
      });

      if (error) throw error;

      return { success: true, email: this.currentUser.email };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(updates) {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      // Update auth metadata
      const { data: authData, error: authError } = await auth.updateUser({
        data: {
          displayName: updates.displayName,
          photoURL: updates.photoURL
        }
      });

      if (authError) throw authError;

      // Update database record
      const { error: dbError } = await db.from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.currentUser.id);

      if (dbError) throw dbError;

      // Refresh current user data
      const { data: { session } } = await auth.getSession();
      if (session) {
        this.currentUser = await this.enrichUserData(session.user);
      }

      return this.currentUser;
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
    const isEmailVerified = !!user.email_confirmed_at;

    const status = {
      verified: isGaTech && isEmailVerified,
      isGaTechEmail: isGaTech,
      isEmailVerified,
      email: user.email,
      timestamp: new Date().toISOString()
    };

    // Update user record with verification status
    if (status.verified) {
      await db.from('users').update({
        gatech_verified: true,
        gatech_email: user.email,
        verified_at: new Date().toISOString()
      }).eq('id', user.id);
    }

    return status;
  }

  /**
   * Enrich user data with additional information
   */
  async enrichUserData(user) {
    if (!user) return null;

    try {
      // Get user record from database
      const { data: userData, error } = await db.from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user data:', error);
      }

      return {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || userData?.username,
        photoURL: user.user_metadata?.avatar_url || userData?.avatar,
        emailVerified: !!user.email_confirmed_at,
        phoneNumber: user.phone,
        provider: user.app_metadata?.provider,
        metadata: {
          createdAt: user.created_at,
          lastSignIn: user.last_sign_in_at
        },
        // Custom fields from database
        username: userData?.username,
        karma: userData?.karma || { post: 0, comment: 0 },
        gatech_verified: userData?.gatech_verified || false,
        preferences: userData?.preferences || {},
        roles: userData?.roles || [],
        created_at: userData?.created_at,
        last_seen: userData?.last_seen
      };
    } catch (error) {
      console.error('Error enriching user data:', error);
      return user;
    }
  }

  /**
   * Update user record in database
   */
  async updateUserRecord(user) {
    if (!user) return;

    try {
      const { data: existing } = await db.from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      const userRecord = {
        id: user.id,
        email: user.email,
        username: user.displayName || user.email?.split('@')[0],
        display_name: user.displayName,
        photo_url: user.photoURL,
        email_verified: user.emailVerified,
        gatech_verified: this.isGaTechEmail(user.email) && user.emailVerified,
        last_seen: new Date().toISOString(),
        online_status: 'online'
      };

      if (!existing) {
        // Create new user record
        await db.from('users').insert({
          ...userRecord,
          karma: { post: 0, comment: 0 },
          preferences: {
            theme: 'dark',
            notifications: true,
            email_updates: false
          },
          roles: [],
          created_at: new Date().toISOString()
        });
      } else {
        // Update existing user
        await db.from('users').update(userRecord).eq('id', user.id);
      }
    } catch (error) {
      console.error('Error updating user record:', error);
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
      'invalid_credentials': 'Invalid email or password',
      'email_not_confirmed': 'Please confirm your email address',
      'user_not_found': 'No user found with this email',
      'user_already_exists': 'An account with this email already exists',
      'weak_password': 'Password is too weak',
      'invalid_email': 'Invalid email address',
      'signup_disabled': 'Sign ups are currently disabled',
      'user_banned': 'This account has been banned',
      'session_not_found': 'Session expired, please sign in again',
      'refresh_token_not_found': 'Session expired, please sign in again',
      'oauth_error': 'OAuth authentication failed',
      'provider_email_needs_verification': 'Please verify your email with the OAuth provider',
      'validation_failed': 'Validation failed, please check your input'
    };

    const code = error.code || error.error || 'unknown';
    return {
      code,
      message: errorMessages[code] || error.message || 'An authentication error occurred',
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
      const unsubscribe = auth.onAuthStateChange((event, session) => {
        unsubscribe.subscription.unsubscribe();
        resolve(session?.user || null);
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
  linkProvider,
  unlinkProvider,
  reauthenticate,
  getIdToken: getUserToken,
  getSession
} = authService;

// Export the service instance
export default authService;