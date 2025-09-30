/**
 * GA Tech AI & Vibe-Coding Community Platform
 * Service Worker Registration and Management
 * Handles registration, updates, and error recovery
 */

'use strict';

(function() {
  // Configuration
  const SW_CONFIG = {
    swPath: '/service-worker.js',
    scope: '/',
    updateCheckInterval: 3600000, // 1 hour
    retryDelay: 5000,
    maxRetries: 3,
    enableLogging: true
  };

  // State management
  const swState = {
    registration: null,
    updateAvailable: false,
    retryCount: 0,
    lastUpdateCheck: 0,
    isFirstInstall: false
  };

  /**
   * Main initialization function
   */
  function initServiceWorker() {
    // Check browser support
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW Register] Service Workers are not supported in this browser');
      showBrowserCompatibilityWarning();
      return;
    }

    // Check if we're in a secure context
    if (!isSecureContext()) {
      console.warn('[SW Register] Service Workers require a secure context (HTTPS)');
      return;
    }

    // Wait for the page to load completely
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', registerServiceWorker);
    } else {
      registerServiceWorker();
    }
  }

  /**
   * Register the service worker
   */
  async function registerServiceWorker() {
    try {
      log('Starting Service Worker registration...');

      // Register with specific scope
      const registration = await navigator.serviceWorker.register(SW_CONFIG.swPath, {
        scope: SW_CONFIG.scope,
        updateViaCache: 'none'
      });

      swState.registration = registration;
      log('Service Worker registered successfully:', registration.scope);

      // Store registration in global scope for other scripts
      window.swRegistration = registration;

      // Set up event handlers
      setupEventHandlers(registration);

      // Check if this is a first install
      checkFirstInstall(registration);

      // Check for updates immediately and periodically
      checkForUpdates(registration);
      scheduleUpdateChecks(registration);

      // Handle page reload on controller change
      handleControllerChange();

      // Initialize push notifications if supported
      initializePushNotifications(registration);

      // Set up message channel for communication
      setupMessageChannel(registration);

      // Track successful registration
      trackRegistration('success');

    } catch (error) {
      console.error('[SW Register] Registration failed:', error);
      handleRegistrationError(error);
      trackRegistration('failed', error);
    }
  }

  /**
   * Set up event handlers for the registration
   */
  function setupEventHandlers(registration) {
    // Handle installation state changes
    registration.addEventListener('updatefound', () => {
      log('New Service Worker version found');
      const newWorker = registration.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          handleStateChange(newWorker, registration);
        });
      }
    });

    // Handle errors
    navigator.serviceWorker.addEventListener('error', (event) => {
      console.error('[SW Register] Service Worker error:', event);
      handleServiceWorkerError(event);
    });

    // Handle messages from Service Worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  }

  /**
   * Handle Service Worker state changes
   */
  function handleStateChange(worker, registration) {
    log(`Service Worker state changed to: ${worker.state}`);

    switch (worker.state) {
      case 'installing':
        showInstallProgress();
        break;

      case 'installed':
        if (navigator.serviceWorker.controller) {
          // Existing worker updated
          showUpdateAvailable();
          swState.updateAvailable = true;
        } else {
          // New worker installed (first time)
          showInstallSuccess();
          swState.isFirstInstall = true;
        }
        break;

      case 'activated':
        handleActivation(registration);
        break;

      case 'redundant':
        log('Service Worker became redundant');
        break;
    }
  }

  /**
   * Handle Service Worker activation
   */
  function handleActivation(registration) {
    log('Service Worker activated successfully');

    // Clear old caches if needed
    if (swState.updateAvailable) {
      clearOldCaches();
      swState.updateAvailable = false;
    }

    // Claim clients immediately
    if (registration.active) {
      registration.active.postMessage({ type: 'CLIENTS_CLAIM' });
    }

    // Refresh the page if it's an update
    if (!swState.isFirstInstall && swState.updateAvailable) {
      showUpdateComplete();
      schedulePageReload();
    }
  }

  /**
   * Handle controller change (when a new SW takes control)
   */
  function handleControllerChange() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      log('Controller changed, new Service Worker is active');

      // Reload the page if user hasn't interacted much
      if (shouldAutoReload()) {
        window.location.reload();
      } else {
        showRefreshPrompt();
      }
    });
  }

  /**
   * Check for Service Worker updates
   */
  async function checkForUpdates(registration) {
    const now = Date.now();

    // Throttle update checks
    if (now - swState.lastUpdateCheck < 60000) { // Minimum 1 minute between checks
      return;
    }

    swState.lastUpdateCheck = now;

    try {
      log('Checking for Service Worker updates...');
      await registration.update();
    } catch (error) {
      console.error('[SW Register] Update check failed:', error);
    }
  }

  /**
   * Schedule periodic update checks
   */
  function scheduleUpdateChecks(registration) {
    // Check for updates periodically
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(registration);
      }
    }, SW_CONFIG.updateCheckInterval);

    // Check when the page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(registration);
      }
    });

    // Check on focus
    window.addEventListener('focus', () => {
      checkForUpdates(registration);
    });
  }

  /**
   * Initialize push notifications
   */
  async function initializePushNotifications(registration) {
    if (!('PushManager' in window)) {
      log('Push notifications not supported');
      return;
    }

    try {
      // Check current permission status
      const permission = await getNotificationPermission();

      if (permission === 'granted') {
        // Subscribe to push notifications
        await subscribeToPush(registration);
      } else if (permission === 'default') {
        // Show notification prompt UI
        showNotificationPrompt(registration);
      }
    } catch (error) {
      console.error('[SW Register] Push initialization failed:', error);
    }
  }

  /**
   * Get notification permission status
   */
  async function getNotificationPermission() {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Subscribe to push notifications
   */
  async function subscribeToPush(registration) {
    try {
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Create new subscription
        const vapidPublicKey = await getVapidPublicKey();

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Send subscription to server
        await sendSubscriptionToServer(subscription);
        log('Subscribed to push notifications');
      } else {
        log('Already subscribed to push notifications');
      }

      // Store subscription status
      localStorage.setItem('push_subscription', JSON.stringify({
        subscribed: true,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('[SW Register] Push subscription failed:', error);
    }
  }

  /**
   * Set up message channel for SW communication
   */
  function setupMessageChannel(registration) {
    // Create a message channel for bi-directional communication
    const messageChannel = new MessageChannel();

    // Send one port to the Service Worker
    if (registration.active) {
      registration.active.postMessage({
        type: 'PORT_INITIALIZATION'
      }, [messageChannel.port2]);
    }

    // Listen on the other port
    messageChannel.port1.onmessage = (event) => {
      handleServiceWorkerMessage(event);
    };

    // Store the port for later use
    window.swMessagePort = messageChannel.port1;
  }

  /**
   * Handle messages from Service Worker
   */
  function handleServiceWorkerMessage(event) {
    const { type, data } = event.data;
    log('Message from Service Worker:', type, data);

    switch (type) {
      case 'update-available':
        showUpdateAvailable();
        break;

      case 'cache-updated':
        handleCacheUpdate(data);
        break;

      case 'sync-complete':
        handleSyncComplete(data);
        break;

      case 'notification-clicked':
        handleNotificationClick(data);
        break;

      case 'post-synced':
      case 'comment-synced':
      case 'vote-synced':
        handleContentSync(type, data);
        break;

      default:
        log('Unknown message type:', type);
    }
  }

  /**
   * Handle registration errors with retry logic
   */
  function handleRegistrationError(error) {
    swState.retryCount++;

    if (swState.retryCount <= SW_CONFIG.maxRetries) {
      log(`Retrying registration in ${SW_CONFIG.retryDelay}ms (attempt ${swState.retryCount}/${SW_CONFIG.maxRetries})`);

      setTimeout(() => {
        registerServiceWorker();
      }, SW_CONFIG.retryDelay);
    } else {
      console.error('[SW Register] Max retries exceeded. Service Worker registration failed permanently.');
      showRegistrationError(error);
    }
  }

  /**
   * Clear old caches when updating
   */
  async function clearOldCaches() {
    try {
      const cacheNames = await caches.keys();
      const currentCaches = ['static-cache-v2.0.0', 'dynamic-cache-v2.0.0']; // Update with actual cache names

      const cachesToDelete = cacheNames.filter(name => !currentCaches.includes(name));

      await Promise.all(cachesToDelete.map(name => caches.delete(name)));

      if (cachesToDelete.length > 0) {
        log(`Deleted ${cachesToDelete.length} old cache(s)`);
      }
    } catch (error) {
      console.error('[SW Register] Failed to clear old caches:', error);
    }
  }

  /**
   * UI Functions
   */

  function showInstallProgress() {
    showNotification('Installing app...', 'info', 2000);
  }

  function showInstallSuccess() {
    showNotification('App installed successfully!', 'success', 3000);
  }

  function showUpdateAvailable() {
    const notification = showNotification(
      'Update available! Click to refresh.',
      'info',
      0,
      [{
        text: 'Update Now',
        action: () => {
          applyUpdate();
        }
      }, {
        text: 'Later',
        action: () => {
          dismissNotification(notification);
        }
      }]
    );
  }

  function showUpdateComplete() {
    showNotification('App updated successfully!', 'success', 3000);
  }

  function showRefreshPrompt() {
    showNotification(
      'App updated. Please refresh for the latest version.',
      'info',
      0,
      [{
        text: 'Refresh',
        action: () => window.location.reload()
      }]
    );
  }

  function showRegistrationError(error) {
    showNotification(
      `Service Worker registration failed: ${error.message}`,
      'error',
      5000
    );
  }

  function showBrowserCompatibilityWarning() {
    showNotification(
      'Your browser doesn\'t support all app features. Consider updating for the best experience.',
      'warning',
      5000
    );
  }

  function showNotificationPrompt(registration) {
    // Implement notification permission prompt UI
    const prompt = showNotification(
      'Enable notifications to stay updated',
      'info',
      0,
      [{
        text: 'Enable',
        action: async () => {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            await subscribeToPush(registration);
            dismissNotification(prompt);
            showNotification('Notifications enabled!', 'success', 3000);
          }
        }
      }, {
        text: 'Not Now',
        action: () => {
          dismissNotification(prompt);
          localStorage.setItem('notification_prompt_dismissed', Date.now().toString());
        }
      }]
    );
  }

  /**
   * Apply Service Worker update
   */
  function applyUpdate() {
    if (swState.registration && swState.registration.waiting) {
      // Tell waiting SW to skip waiting
      swState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  /**
   * Utility Functions
   */

  function isSecureContext() {
    return window.isSecureContext ||
           location.protocol === 'https:' ||
           location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1';
  }

  function checkFirstInstall(registration) {
    const installData = localStorage.getItem('sw_install_data');
    if (!installData) {
      swState.isFirstInstall = true;
      localStorage.setItem('sw_install_data', JSON.stringify({
        installedAt: Date.now(),
        version: 'v2.0.0'
      }));
    }
  }

  function shouldAutoReload() {
    // Auto reload if user hasn't interacted much with the page
    const interactions = parseInt(sessionStorage.getItem('user_interactions') || '0');
    const timeOnPage = Date.now() - (window.performance.timing?.navigationStart || Date.now());

    return interactions < 5 && timeOnPage < 30000; // Less than 5 interactions and less than 30 seconds on page
  }

  function schedulePageReload() {
    setTimeout(() => {
      if (shouldAutoReload()) {
        window.location.reload();
      } else {
        showRefreshPrompt();
      }
    }, 2000);
  }

  function handleCacheUpdate(data) {
    log('Cache updated:', data);
    // Implement cache update handling
  }

  function handleSyncComplete(data) {
    log('Sync complete:', data);
    showNotification('Your changes have been synced', 'success', 2000);
  }

  function handleNotificationClick(data) {
    log('Notification clicked:', data);
    // Handle notification click navigation
    if (data.url) {
      window.location.href = data.url;
    }
  }

  function handleContentSync(type, data) {
    log(`Content synced: ${type}`, data);
    // Update UI to reflect synced content
    const event = new CustomEvent('content-synced', { detail: { type, data } });
    window.dispatchEvent(event);
  }

  async function getVapidPublicKey() {
    // Fetch VAPID public key from server
    try {
      const response = await fetch('/api/push/vapid-key');
      const data = await response.json();
      return data.publicKey;
    } catch (error) {
      // Fallback to hardcoded key (replace with your actual key)
      return 'BEL8jIdqagmQvcPWK1vBXp8iQKBNHvTuCzwkvNvPmvNgXQFYFvfGJvHZRKJnP3E_GqsUlQVhw5DRhYZw3NmSxmA';
    }
  }

  async function sendSubscriptionToServer(subscription) {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });
    } catch (error) {
      console.error('[SW Register] Failed to send subscription to server:', error);
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function showNotification(message, type = 'info', duration = 3000, actions = []) {
    const notification = document.createElement('div');
    notification.className = `sw-notification sw-notification-${type}`;
    notification.innerHTML = `
      <div class="sw-notification-content">
        <span class="sw-notification-message">${message}</span>
        ${actions.length > 0 ? `
          <div class="sw-notification-actions">
            ${actions.map((action, i) => `
              <button class="sw-notification-action" data-action="${i}">${action.text}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('sw-notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'sw-notification-styles';
      styles.textContent = `
        .sw-notification {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: white;
          padding: 16px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 100000;
          transition: transform 0.3s ease;
          max-width: 90%;
          min-width: 300px;
        }
        .sw-notification.show {
          transform: translateX(-50%) translateY(0);
        }
        .sw-notification-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sw-notification-message {
          flex: 1;
        }
        .sw-notification-actions {
          display: flex;
          gap: 8px;
        }
        .sw-notification-action {
          padding: 4px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
        }
        .sw-notification-action:hover {
          background: #f0f0f0;
        }
        .sw-notification-success {
          border-left: 4px solid #4CAF50;
        }
        .sw-notification-error {
          border-left: 4px solid #f44336;
        }
        .sw-notification-warning {
          border-left: 4px solid #ff9800;
        }
        .sw-notification-info {
          border-left: 4px solid #2196F3;
        }
        @media (prefers-color-scheme: dark) {
          .sw-notification {
            background: #2d2d2d;
            color: #e0e0e0;
          }
          .sw-notification-action {
            background: #3d3d3d;
            border-color: #4d4d4d;
            color: #e0e0e0;
          }
          .sw-notification-action:hover {
            background: #4d4d4d;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Add action handlers
    if (actions.length > 0) {
      notification.querySelectorAll('.sw-notification-action').forEach((btn, i) => {
        btn.addEventListener('click', () => {
          actions[i].action();
        });
      });
    }

    // Show notification
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // Auto dismiss if duration is set
    if (duration > 0) {
      setTimeout(() => {
        dismissNotification(notification);
      }, duration);
    }

    return notification;
  }

  function dismissNotification(notification) {
    if (notification) {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }

  function trackRegistration(status, error = null) {
    // Track Service Worker registration status
    const data = {
      status,
      timestamp: Date.now(),
      url: location.href,
      userAgent: navigator.userAgent,
      error: error ? error.message : null
    };

    // Send to analytics if available
    if (typeof gtag !== 'undefined') {
      gtag('event', 'sw_registration', data);
    }

    // Store locally
    localStorage.setItem('sw_registration_status', JSON.stringify(data));
  }

  function handleServiceWorkerError(event) {
    console.error('[SW Register] Service Worker error:', event);
    // Implement error recovery strategy
  }

  function log(...args) {
    if (SW_CONFIG.enableLogging) {
      console.log('[SW Register]', ...args);
    }
  }

  // Track user interactions for auto-reload decision
  ['click', 'scroll', 'keypress', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      const interactions = parseInt(sessionStorage.getItem('user_interactions') || '0');
      sessionStorage.setItem('user_interactions', (interactions + 1).toString());
    }, { once: true, passive: true });
  });

  // Initialize Service Worker registration
  initServiceWorker();

  // Export for external use
  window.swManager = {
    getRegistration: () => swState.registration,
    checkForUpdates: () => checkForUpdates(swState.registration),
    applyUpdate: applyUpdate,
    isUpdateAvailable: () => swState.updateAvailable,
    requestNotificationPermission: async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && swState.registration) {
        await subscribeToPush(swState.registration);
      }
      return permission;
    }
  };

})();