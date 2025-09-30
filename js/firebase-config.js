/**
 * Firebase Configuration and Initialization
 * Firebase v10+ Modular SDK
 *
 * This module handles Firebase app initialization and exports configured services.
 * Supports environment variables for different deployment environments.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  enableNetwork,
  disableNetwork,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator
} from 'firebase/storage';
import {
  getAnalytics,
  isSupported as isAnalyticsSupported
} from 'firebase/analytics';
import {
  getPerformance,
  trace as performanceTrace
} from 'firebase/performance';
import {
  getFunctions,
  connectFunctionsEmulator
} from 'firebase/functions';

/**
 * Firebase configuration object
 * In production, these values should come from environment variables
 */
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your-api-key-here",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "gatech-community.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "gatech-community",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "gatech-community.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.FIREBASE_APP_ID || "1:123456789:web:abcdef123456",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX"
};

/**
 * Environment detection
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Initialize Firebase App
 */
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  throw new Error('Failed to initialize Firebase. Check your configuration.');
}

/**
 * Initialize Authentication
 */
const auth = getAuth(app);

// Configure auth settings
auth.useDeviceLanguage(); // Use device language for auth UI
auth.settings.appVerificationDisabledForTesting = isTest; // Disable reCAPTCHA in test

/**
 * Initialize Firestore
 */
const db = getFirestore(app);

// Enable offline persistence for better user experience
if (!isTest) {
  enableIndexedDbPersistence(db, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistence not available in this browser');
    }
  });
}

/**
 * Initialize Storage
 */
const storage = getStorage(app);

/**
 * Initialize Cloud Functions
 */
const functions = getFunctions(app);

/**
 * Initialize Analytics (only in production)
 */
let analytics = null;
if (isProduction) {
  isAnalyticsSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
      console.log('Analytics initialized');
    }
  });
}

/**
 * Initialize Performance Monitoring (only in production)
 */
let performance = null;
if (isProduction && typeof window !== 'undefined') {
  performance = getPerformance(app);
  console.log('Performance monitoring initialized');
}

/**
 * Connect to emulators in development
 */
if (isDevelopment && !window._emulatorsConnected) {
  // Prevent multiple connections in hot-reload scenarios
  window._emulatorsConnected = true;

  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    console.log('Connected to Auth emulator');
  } catch (error) {
    console.warn('Auth emulator connection failed:', error);
  }

  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('Connected to Firestore emulator');
  } catch (error) {
    console.warn('Firestore emulator connection failed:', error);
  }

  try {
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('Connected to Storage emulator');
  } catch (error) {
    console.warn('Storage emulator connection failed:', error);
  }

  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('Connected to Functions emulator');
  } catch (error) {
    console.warn('Functions emulator connection failed:', error);
  }
}

/**
 * Network state management
 */
class NetworkManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = new Set();

    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  handleOnline() {
    this.isOnline = true;
    enableNetwork(db).then(() => {
      console.log('Firestore network enabled');
      this.notifyListeners('online');
    });
  }

  handleOffline() {
    this.isOnline = false;
    disableNetwork(db).then(() => {
      console.log('Firestore network disabled, using cache');
      this.notifyListeners('offline');
    });
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(status) {
    this.listeners.forEach(callback => callback(status));
  }
}

const networkManager = new NetworkManager();

/**
 * Performance tracing utility
 */
export const trace = (name) => {
  if (performance) {
    return performanceTrace(performance, name);
  }
  // Return dummy trace object for non-production
  return {
    start: () => {},
    stop: () => {},
    putAttribute: () => {},
    putMetric: () => {},
    getAttribute: () => null,
    getMetric: () => 0,
    getAttributes: () => ({}),
    incrementMetric: () => {},
    removeAttribute: () => {},
    record: () => {}
  };
};

/**
 * Firebase service health check
 */
export const checkHealth = async () => {
  const health = {
    auth: false,
    firestore: false,
    storage: false,
    functions: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Check auth
    await auth.authStateReady();
    health.auth = true;
  } catch (error) {
    console.error('Auth health check failed:', error);
  }

  try {
    // Check Firestore with a simple read
    const testDoc = await db.collection('_health').doc('check').get();
    health.firestore = true;
  } catch (error) {
    console.error('Firestore health check failed:', error);
  }

  try {
    // Check storage
    const testRef = storage.ref('_health/check.txt');
    health.storage = true;
  } catch (error) {
    console.error('Storage health check failed:', error);
  }

  health.overall = health.auth && health.firestore && health.storage;
  return health;
};

/**
 * Export configured Firebase services
 */
export {
  app,
  auth,
  db,
  storage,
  functions,
  analytics,
  performance,
  networkManager
};

/**
 * Export Firebase configuration for transparency
 */
export const config = {
  projectId: firebaseConfig.projectId,
  environment: isDevelopment ? 'development' : isProduction ? 'production' : 'test',
  features: {
    auth: true,
    firestore: true,
    storage: true,
    functions: true,
    analytics: !!analytics,
    performance: !!performance,
    offline: !isTest
  }
};

// Log configuration on initialization (dev only)
if (isDevelopment) {
  console.log('Firebase Configuration:', config);
}