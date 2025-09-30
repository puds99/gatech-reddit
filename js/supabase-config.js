/**
 * Supabase Configuration and Initialization
 * Supabase v2 JavaScript Client
 *
 * This module handles Supabase app initialization and exports configured services.
 * Supports environment variables for different deployment environments.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase configuration
 * In production, these values should come from environment variables
 */
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key-here';

/**
 * Environment detection
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Initialize Supabase Client with options
 */
let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'gatech-auth',
      flowType: 'pkce' // More secure for SPAs
    },
    db: {
      schema: 'public'
    },
    realtime: {
      params: {
        eventsPerSecond: isDevelopment ? 10 : 5
      }
    },
    global: {
      headers: {
        'x-app-name': 'gatech-reddit-system'
      }
    }
  });

  console.log('Supabase initialized successfully');
} catch (error) {
  console.error('Supabase initialization error:', error);
  throw new Error('Failed to initialize Supabase. Check your configuration.');
}

/**
 * Auth helper - Supabase auth instance
 */
const auth = supabase.auth;

/**
 * Database helper - Supabase database operations
 */
const db = supabase;

/**
 * Storage helper - Supabase storage operations
 */
const storage = supabase.storage;

/**
 * Realtime helper - Supabase realtime subscriptions
 */
const realtime = supabase.channel;

/**
 * Network state management
 */
class NetworkManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = new Set();
    this.retryQueue = [];

    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  handleOnline() {
    this.isOnline = true;
    console.log('Network connection restored');
    this.processRetryQueue();
    this.notifyListeners('online');
  }

  handleOffline() {
    this.isOnline = false;
    console.log('Network connection lost');
    this.notifyListeners('offline');
  }

  addToRetryQueue(operation) {
    this.retryQueue.push(operation);
  }

  async processRetryQueue() {
    while (this.retryQueue.length > 0) {
      const operation = this.retryQueue.shift();
      try {
        await operation();
      } catch (error) {
        console.error('Retry operation failed:', error);
      }
    }
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
 * Performance tracing utility (compatibility layer)
 */
export const trace = (name) => {
  const startTime = performance.now();

  return {
    start: () => {},
    stop: () => {
      const duration = performance.now() - startTime;
      if (isDevelopment) {
        console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      }
    },
    putAttribute: (key, value) => {
      if (isDevelopment) {
        console.log(`[Trace] ${name} - ${key}: ${value}`);
      }
    },
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
 * Supabase service health check
 */
export const checkHealth = async () => {
  const health = {
    auth: false,
    database: false,
    storage: false,
    realtime: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Check auth
    const { data: session } = await auth.getSession();
    health.auth = true;
  } catch (error) {
    console.error('Auth health check failed:', error);
  }

  try {
    // Check database with a simple query
    const { error } = await db.from('users').select('id').limit(1);
    if (!error) health.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  try {
    // Check storage
    const { data, error } = await storage.listBuckets();
    if (!error) health.storage = true;
  } catch (error) {
    console.error('Storage health check failed:', error);
  }

  try {
    // Check realtime
    const channel = supabase.channel('health-check');
    await new Promise((resolve) => {
      channel.on('presence', { event: 'sync' }, () => {
        health.realtime = true;
        resolve();
      }).subscribe();
      setTimeout(resolve, 1000); // Timeout after 1 second
    });
    channel.unsubscribe();
  } catch (error) {
    console.error('Realtime health check failed:', error);
  }

  health.overall = health.auth && health.database && health.storage;
  return health;
};

/**
 * Session management utilities
 */
export const sessionManager = {
  async getSession() {
    const { data, error } = await auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async refreshSession() {
    const { data, error } = await auth.refreshSession();
    if (error) throw error;
    return data.session;
  },

  onSessionChange(callback) {
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return subscription;
  }
};

/**
 * Error handling utilities
 */
export const handleSupabaseError = (error) => {
  const errorMessages = {
    '23505': 'This resource already exists',
    '23503': 'Referenced resource not found',
    '23502': 'Required field is missing',
    '23514': 'Invalid data provided',
    '42501': 'Permission denied',
    '42P01': 'Resource not found',
    'PGRST116': 'The result contains zero rows',
    'PGRST301': 'JWT expired',
    '22P02': 'Invalid input syntax',
    '57014': 'Query timeout',
    '08003': 'Connection error',
    '08006': 'Connection lost'
  };

  const code = error.code || error.details?.code;
  const message = errorMessages[code] || error.message || 'An unexpected error occurred';

  return {
    code,
    message,
    details: error
  };
};

/**
 * Retry logic for failed operations
 */
export const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors
      if (error.message?.includes('JWT') || error.code === '42501') {
        throw error;
      }

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
};

/**
 * Export configured Supabase services
 */
export {
  supabase as app,
  auth,
  db,
  storage,
  realtime,
  networkManager
};

/**
 * Export Supabase configuration for transparency
 */
export const config = {
  projectUrl: supabaseUrl,
  environment: isDevelopment ? 'development' : isProduction ? 'production' : 'test',
  features: {
    auth: true,
    database: true,
    storage: true,
    realtime: true,
    offline: true
  }
};

// Log configuration on initialization (dev only)
if (isDevelopment) {
  console.log('Supabase Configuration:', config);
}

/**
 * Default export for compatibility
 */
export default supabase;