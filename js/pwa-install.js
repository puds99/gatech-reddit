/**
 * GA Tech AI & Vibe-Coding Community Platform
 * PWA Installation Handler
 * Manages install prompts, iOS instructions, and update notifications
 */

'use strict';

class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.installBanner = null;
    this.isInstalled = false;
    this.isIOS = false;
    this.isStandalone = false;
    this.installSource = null;

    this.init();
  }

  init() {
    // Detect platform
    this.detectPlatform();

    // Check if already installed
    this.checkInstallStatus();

    // Set up event listeners
    this.setupEventListeners();

    // Initialize UI elements
    this.initializeUI();

    // Check for app updates
    this.checkForUpdates();

    // Track install metrics
    this.trackInstallMetrics();
  }

  detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();

    this.isIOS = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    this.isAndroid = /android/.test(ua);
    this.isWindows = /windows/.test(ua);
    this.isMac = /mac/.test(ua) && !this.isIOS;
    this.isMobile = /mobile/.test(ua) || this.isIOS || this.isAndroid;

    // Check if running as standalone app
    this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true ||
                       document.referrer.includes('android-app://');

    // Check if installation is supported
    this.isInstallSupported = 'BeforeInstallPromptEvent' in window;
  }

  checkInstallStatus() {
    // Check localStorage for previous installation
    const installData = localStorage.getItem('pwa_install_data');
    if (installData) {
      const data = JSON.parse(installData);
      this.isInstalled = data.installed;
      this.installSource = data.source;
    }

    // Update install status based on display mode
    if (this.isStandalone) {
      this.isInstalled = true;
      this.saveInstallData({
        installed: true,
        timestamp: Date.now(),
        source: 'standalone'
      });
    }
  }

  setupEventListeners() {
    // Capture install prompt event
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;

      console.log('[PWA Install] Install prompt captured');

      // Show install UI
      this.showInstallUI();

      // Track that prompt was shown
      this.trackEvent('prompt_shown');
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('[PWA Install] App installed successfully');

      this.isInstalled = true;
      this.hideInstallUI();

      // Save installation data
      this.saveInstallData({
        installed: true,
        timestamp: Date.now(),
        source: this.installSource || 'browser'
      });

      // Show success message
      this.showInstallSuccess();

      // Track successful installation
      this.trackEvent('app_installed');
    });

    // Handle display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (event) => {
      if (event.matches) {
        this.isStandalone = true;
        this.isInstalled = true;
        this.hideInstallUI();
      }
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isInstalled) {
        this.checkForUpdates();
      }
    });
  }

  initializeUI() {
    // Create install button
    this.createInstallButton();

    // Create install banner
    this.createInstallBanner();

    // Create iOS install instructions
    if (this.isIOS) {
      this.createIOSInstructions();
    }

    // Create update notification UI
    this.createUpdateUI();
  }

  createInstallButton() {
    const buttonHTML = `
      <button id="pwa-install-button" class="pwa-install-button" aria-label="Install App" style="display: none;">
        <svg class="install-icon" width="20" height="20" viewBox="0 0 24 24">
          <path d="M13 5v6h1.17L12 13.17 9.83 11H11V5h2m2-2H9v6H5l7 7 7-7h-4V3zm4 15H5v2h14v-2z" fill="currentColor"/>
        </svg>
        <span class="install-text">Install App</span>
      </button>
    `;

    document.body.insertAdjacentHTML('beforeend', buttonHTML);
    this.installButton = document.getElementById('pwa-install-button');

    // Add click handler
    this.installButton.addEventListener('click', () => {
      this.installSource = 'button';
      this.promptInstall();
    });

    // Add styles
    this.addStyles();
  }

  createInstallBanner() {
    const bannerHTML = `
      <div id="pwa-install-banner" class="pwa-install-banner" style="display: none;">
        <div class="banner-content">
          <img src="/images/icons/icon-72x72.png" alt="App Icon" class="banner-icon">
          <div class="banner-text">
            <h3>Install GA Tech Community</h3>
            <p>Add to your home screen for the best experience</p>
          </div>
          <div class="banner-actions">
            <button class="banner-install-btn">Install</button>
            <button class="banner-dismiss-btn" aria-label="Dismiss">×</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', bannerHTML);
    this.installBanner = document.getElementById('pwa-install-banner');

    // Add event handlers
    const installBtn = this.installBanner.querySelector('.banner-install-btn');
    const dismissBtn = this.installBanner.querySelector('.banner-dismiss-btn');

    installBtn.addEventListener('click', () => {
      this.installSource = 'banner';
      this.promptInstall();
    });

    dismissBtn.addEventListener('click', () => {
      this.dismissInstallBanner();
    });
  }

  createIOSInstructions() {
    const instructionsHTML = `
      <div id="ios-install-modal" class="ios-install-modal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <button class="modal-close" aria-label="Close">×</button>
          <h2>Install GA Tech Community</h2>
          <div class="ios-instructions">
            <div class="instruction-step">
              <span class="step-number">1</span>
              <p>Tap the Share button
                <svg width="20" height="20" viewBox="0 0 24 24" class="share-icon">
                  <path d="M12 2L8 6h3v9h2V6h3l-4-4zm-7 18v-2h14v2H5z" fill="#007AFF"/>
                </svg>
                at the bottom of your screen
              </p>
            </div>
            <div class="instruction-step">
              <span class="step-number">2</span>
              <p>Scroll down and tap "Add to Home Screen"
                <svg width="20" height="20" viewBox="0 0 24 24" class="add-icon">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" fill="#007AFF"/>
                </svg>
              </p>
            </div>
            <div class="instruction-step">
              <span class="step-number">3</span>
              <p>Tap "Add" to install the app</p>
            </div>
          </div>
          <div class="ios-reminder">
            <input type="checkbox" id="ios-dont-show">
            <label for="ios-dont-show">Don't show this again</label>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', instructionsHTML);

    const modal = document.getElementById('ios-install-modal');
    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal.querySelector('.modal-overlay');
    const dontShowCheckbox = document.getElementById('ios-dont-show');

    const closeModal = () => {
      modal.style.display = 'none';
      if (dontShowCheckbox.checked) {
        localStorage.setItem('ios_install_dismissed', 'true');
      }
    };

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    // Show iOS instructions if appropriate
    if (this.isIOS && !this.isStandalone && !localStorage.getItem('ios_install_dismissed')) {
      setTimeout(() => {
        this.showIOSInstructions();
      }, 3000);
    }
  }

  createUpdateUI() {
    const updateHTML = `
      <div id="pwa-update-notification" class="pwa-update-notification" style="display: none;">
        <div class="update-content">
          <svg class="update-icon" width="24" height="24" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#4CAF50"/>
          </svg>
          <div class="update-text">
            <strong>Update available!</strong>
            <p>A new version of the app is available.</p>
          </div>
          <button class="update-button">Update Now</button>
          <button class="update-dismiss" aria-label="Dismiss">×</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', updateHTML);

    const updateNotification = document.getElementById('pwa-update-notification');
    const updateBtn = updateNotification.querySelector('.update-button');
    const dismissBtn = updateNotification.querySelector('.update-dismiss');

    updateBtn.addEventListener('click', () => {
      this.applyUpdate();
    });

    dismissBtn.addEventListener('click', () => {
      updateNotification.style.display = 'none';
      sessionStorage.setItem('update_dismissed', 'true');
    });
  }

  showInstallUI() {
    if (this.isInstalled || this.isStandalone) return;

    // Don't show on iOS (use custom instructions instead)
    if (this.isIOS) return;

    // Check if user has dismissed the install prompt recently
    const dismissedTime = localStorage.getItem('install_dismissed_time');
    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) return; // Don't show for a week after dismissal
    }

    // Show install button in navigation
    if (this.installButton) {
      this.installButton.style.display = 'flex';
    }

    // Show install banner after user has engaged with the app
    const engagementScore = this.calculateEngagementScore();
    if (engagementScore >= 3 && !sessionStorage.getItem('banner_shown')) {
      setTimeout(() => {
        this.showInstallBanner();
      }, 5000);
    }
  }

  showInstallBanner() {
    if (this.installBanner && !this.isInstalled && !this.isStandalone) {
      this.installBanner.style.display = 'block';
      this.installBanner.classList.add('slide-in');
      sessionStorage.setItem('banner_shown', 'true');

      // Auto-hide after 30 seconds
      setTimeout(() => {
        if (this.installBanner.style.display === 'block') {
          this.dismissInstallBanner();
        }
      }, 30000);

      this.trackEvent('banner_shown');
    }
  }

  showIOSInstructions() {
    const modal = document.getElementById('ios-install-modal');
    if (modal) {
      modal.style.display = 'block';
      this.trackEvent('ios_instructions_shown');
    }
  }

  hideInstallUI() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }

    if (this.installBanner) {
      this.installBanner.style.display = 'none';
    }
  }

  dismissInstallBanner() {
    if (this.installBanner) {
      this.installBanner.classList.add('slide-out');
      setTimeout(() => {
        this.installBanner.style.display = 'none';
        this.installBanner.classList.remove('slide-in', 'slide-out');
      }, 300);

      localStorage.setItem('install_dismissed_time', Date.now().toString());
      this.trackEvent('banner_dismissed');
    }
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      if (this.isIOS) {
        this.showIOSInstructions();
      } else {
        console.log('[PWA Install] No install prompt available');
        this.showManualInstallInstructions();
      }
      return;
    }

    try {
      // Show the install prompt
      this.deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await this.deferredPrompt.userChoice;

      console.log(`[PWA Install] User response: ${outcome}`);

      if (outcome === 'accepted') {
        this.trackEvent('prompt_accepted');
      } else {
        this.trackEvent('prompt_dismissed');
        localStorage.setItem('install_dismissed_time', Date.now().toString());
      }

      // Clear the deferred prompt
      this.deferredPrompt = null;

      // Hide install UI
      this.hideInstallUI();

    } catch (error) {
      console.error('[PWA Install] Installation failed:', error);
      this.trackEvent('install_error', { error: error.message });
    }
  }

  showManualInstallInstructions() {
    let instructions = '';

    if (this.isAndroid) {
      instructions = 'Open Chrome menu (⋮) → "Add to Home screen"';
    } else if (this.isWindows) {
      instructions = 'Open browser menu → "Install GA Tech Community"';
    } else if (this.isMac) {
      instructions = 'Open browser menu → "Install GA Tech Community"';
    } else {
      instructions = 'Look for the install option in your browser menu';
    }

    this.showNotification('Install App', instructions);
  }

  showInstallSuccess() {
    this.showNotification(
      'App Installed Successfully!',
      'GA Tech Community has been added to your home screen',
      'success'
    );

    // Clear any install-related UI
    this.hideInstallUI();

    // Vibrate if supported
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }

  checkForUpdates() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            this.showUpdateNotification();
          }
        });
      });

      // Check for updates every hour when app is visible
      if (!document.hidden) {
        registration.update();
      }
    });
  }

  showUpdateNotification() {
    if (sessionStorage.getItem('update_dismissed')) return;

    const updateNotification = document.getElementById('pwa-update-notification');
    if (updateNotification) {
      updateNotification.style.display = 'block';
      updateNotification.classList.add('slide-in');

      this.trackEvent('update_available');
    }
  }

  applyUpdate() {
    if (!('serviceWorker' in navigator)) return;

    // Send skip waiting message to service worker
    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });

    // Reload the page to activate new service worker
    window.location.reload();

    this.trackEvent('update_applied');
  }

  calculateEngagementScore() {
    let score = 0;

    // Check various engagement metrics
    const metrics = {
      pageViews: parseInt(sessionStorage.getItem('page_views') || '0'),
      timeSpent: parseInt(sessionStorage.getItem('time_spent') || '0'),
      interactions: parseInt(sessionStorage.getItem('interactions') || '0'),
      hasAccount: !!localStorage.getItem('user_token'),
      returningVisitor: !!localStorage.getItem('returning_visitor')
    };

    if (metrics.pageViews >= 3) score++;
    if (metrics.timeSpent >= 60) score++;
    if (metrics.interactions >= 2) score++;
    if (metrics.hasAccount) score += 2;
    if (metrics.returningVisitor) score++;

    return score;
  }

  saveInstallData(data) {
    localStorage.setItem('pwa_install_data', JSON.stringify(data));
  }

  trackEvent(eventName, data = {}) {
    // Track installation events
    const eventData = {
      event: eventName,
      timestamp: Date.now(),
      platform: {
        ios: this.isIOS,
        android: this.isAndroid,
        windows: this.isWindows,
        mac: this.isMac,
        mobile: this.isMobile
        },
      standalone: this.isStandalone,
      ...data
    };

    // Send to analytics if available
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, eventData);
    }

    // Log to console in development
    console.log('[PWA Install] Event:', eventData);

    // Store locally for debugging
    const events = JSON.parse(localStorage.getItem('pwa_events') || '[]');
    events.push(eventData);
    if (events.length > 50) events.shift();
    localStorage.setItem('pwa_events', JSON.stringify(events));
  }

  trackInstallMetrics() {
    // Track page views
    let pageViews = parseInt(sessionStorage.getItem('page_views') || '0');
    sessionStorage.setItem('page_views', (pageViews + 1).toString());

    // Track time spent
    const startTime = Date.now();
    window.addEventListener('beforeunload', () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      const totalTime = parseInt(sessionStorage.getItem('time_spent') || '0');
      sessionStorage.setItem('time_spent', (totalTime + timeSpent).toString());
    });

    // Track interactions
    let interactionTracked = false;
    ['click', 'scroll', 'keypress'].forEach(event => {
      document.addEventListener(event, () => {
        if (!interactionTracked) {
          interactionTracked = true;
          const interactions = parseInt(sessionStorage.getItem('interactions') || '0');
          sessionStorage.setItem('interactions', (interactions + 1).toString());
          setTimeout(() => { interactionTracked = false; }, 1000);
        }
      }, { passive: true });
    });

    // Mark as returning visitor
    if (localStorage.getItem('first_visit')) {
      localStorage.setItem('returning_visitor', 'true');
    } else {
      localStorage.setItem('first_visit', Date.now().toString());
    }
  }

  showNotification(title, message, type = 'info') {
    const notificationHTML = `
      <div class="pwa-notification pwa-notification-${type}">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', notificationHTML);
    const notification = document.body.lastElementChild;

    setTimeout(() => {
      notification.classList.add('show');
    }, 100);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 5000);
  }

  addStyles() {
    const styles = `
      <style>
        .pwa-install-button {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #003057, #004d8f);
          color: white;
          border: none;
          border-radius: 50px;
          box-shadow: 0 4px 12px rgba(0, 48, 87, 0.3);
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
          z-index: 1000;
        }

        .pwa-install-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 48, 87, 0.4);
        }

        .pwa-install-banner {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
          z-index: 999;
          transform: translateY(100%);
          transition: transform 0.3s ease;
        }

        .pwa-install-banner.slide-in {
          transform: translateY(0);
        }

        .pwa-install-banner.slide-out {
          transform: translateY(100%);
        }

        .banner-content {
          display: flex;
          align-items: center;
          padding: 16px;
          gap: 12px;
        }

        .banner-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
        }

        .banner-text {
          flex: 1;
        }

        .banner-text h3 {
          margin: 0;
          font-size: 16px;
          color: #003057;
        }

        .banner-text p {
          margin: 4px 0 0;
          font-size: 14px;
          color: #666;
        }

        .banner-actions {
          display: flex;
          gap: 8px;
        }

        .banner-install-btn {
          padding: 8px 20px;
          background: #003057;
          color: white;
          border: none;
          border-radius: 20px;
          font-weight: 600;
          cursor: pointer;
        }

        .banner-dismiss-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          font-size: 24px;
          color: #999;
          cursor: pointer;
        }

        .ios-install-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
        }

        .modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          font-size: 24px;
          cursor: pointer;
        }

        .ios-instructions {
          margin: 20px 0;
        }

        .instruction-step {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin: 16px 0;
        }

        .step-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: #007AFF;
          color: white;
          border-radius: 50%;
          font-size: 12px;
          font-weight: bold;
          flex-shrink: 0;
        }

        .pwa-update-notification {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10000;
          transition: transform 0.3s ease;
        }

        .pwa-update-notification.slide-in {
          transform: translateX(-50%) translateY(0);
        }

        .update-content {
          display: flex;
          align-items: center;
          padding: 16px;
          gap: 12px;
        }

        .update-button {
          padding: 6px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 20px;
          font-weight: 600;
          cursor: pointer;
        }

        .pwa-notification {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: white;
          padding: 16px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10001;
          transition: transform 0.3s ease;
        }

        .pwa-notification.show {
          transform: translateX(-50%) translateY(0);
        }

        .pwa-notification-success {
          border-left: 4px solid #4CAF50;
        }

        .pwa-notification-info {
          border-left: 4px solid #2196F3;
        }

        @media (max-width: 768px) {
          .pwa-install-button {
            bottom: 70px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .pwa-install-banner,
          .modal-content,
          .pwa-update-notification,
          .pwa-notification {
            background: #1e1e1e;
            color: #e0e0e0;
          }

          .banner-text h3 {
            color: #B3A369;
          }

          .banner-text p,
          .banner-dismiss-btn {
            color: #999;
          }
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}

// Initialize PWA Install Manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.pwaInstallManager = new PWAInstallManager();
  });
} else {
  window.pwaInstallManager = new PWAInstallManager();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAInstallManager;
}