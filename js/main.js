/**
 * ===============================================================================
 * MAIN.JS - Core Application Functionality
 * GA Tech AI & Vibe-Coding Community Platform
 * Version: 1.0.0 - ES2025 Modern JavaScript
 * ===============================================================================
 */

// ===============================================================================
// GLOBAL APP STATE & CONFIGURATION
// ===============================================================================

const AppConfig = {
  theme: {
    default: 'dark',
    storageKey: 'gt-theme-preference'
  },
  api: {
    baseUrl: '/api', // Will be replaced with Firebase
    timeout: 10000
  },
  notifications: {
    duration: 3000,
    position: 'bottom-right'
  },
  search: {
    debounceMs: 300,
    minChars: 2
  },
  localStorage: {
    prefix: 'gt-community-'
  }
};

// ===============================================================================
// THEME MANAGER
// ===============================================================================

class ThemeManager {
  constructor() {
    this.currentTheme = this.loadSavedTheme();
    this.observers = new Set();
    this.init();
  }

  init() {
    // Apply saved theme immediately to prevent flash
    this.applyTheme(this.currentTheme);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (!this.hasUserPreference()) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });

    // Listen for theme toggle button clicks
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-theme-toggle]')) {
        this.toggleTheme();
      }
    });
  }

  loadSavedTheme() {
    const saved = localStorage.getItem(AppConfig.theme.storageKey);
    if (saved) return saved;

    // Use system preference as default
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  hasUserPreference() {
    return localStorage.getItem(AppConfig.theme.storageKey) !== null;
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    // Update meta theme-color for mobile browsers
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    }

    // Notify observers
    this.observers.forEach(callback => callback(theme));
  }

  setTheme(theme) {
    this.currentTheme = theme;
    this.applyTheme(theme);
    localStorage.setItem(AppConfig.theme.storageKey, theme);
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  observe(callback) {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }
}

// ===============================================================================
// NAVIGATION HANDLER
// ===============================================================================

class NavigationManager {
  constructor() {
    this.mobileMenuOpen = false;
    this.activeDropdowns = new Set();
    this.init();
  }

  init() {
    this.setupMobileMenu();
    this.setupDropdowns();
    this.setupActiveStates();
    this.setupKeyboardNav();
    this.setupBreadcrumbs();
  }

  setupMobileMenu() {
    const hamburger = document.querySelector('[data-mobile-menu-toggle]');
    const mobileMenu = document.querySelector('[data-mobile-menu]');
    const overlay = document.querySelector('[data-mobile-menu-overlay]');

    if (!hamburger || !mobileMenu) return;

    // Toggle menu
    hamburger?.addEventListener('click', () => {
      this.toggleMobileMenu();
    });

    // Close on overlay click
    overlay?.addEventListener('click', () => {
      this.closeMobileMenu();
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mobileMenuOpen) {
        this.closeMobileMenu();
      }
    });

    // Handle swipe gestures
    this.setupSwipeGestures(mobileMenu);
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const menu = document.querySelector('[data-mobile-menu]');
    const overlay = document.querySelector('[data-mobile-menu-overlay]');
    const body = document.body;

    if (this.mobileMenuOpen) {
      menu?.classList.add('active');
      overlay?.classList.add('active');
      body.style.overflow = 'hidden';
      this.trapFocus(menu);
    } else {
      menu?.classList.remove('active');
      overlay?.classList.remove('active');
      body.style.overflow = '';
      this.releaseFocus();
    }
  }

  closeMobileMenu() {
    if (this.mobileMenuOpen) {
      this.toggleMobileMenu();
    }
  }

  setupSwipeGestures(element) {
    let touchStartX = 0;
    let touchEndX = 0;

    element.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    });

    element.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeDistance = touchEndX - touchStartX;

      // Swipe left to close (more than 50px swipe)
      if (swipeDistance < -50) {
        this.closeMobileMenu();
      }
    });
  }

  setupDropdowns() {
    const dropdowns = document.querySelectorAll('[data-dropdown]');

    dropdowns.forEach(dropdown => {
      const trigger = dropdown.querySelector('[data-dropdown-trigger]');
      const menu = dropdown.querySelector('[data-dropdown-menu]');

      if (!trigger || !menu) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown(dropdown);
      });

      // Close on outside click
      document.addEventListener('click', () => {
        if (this.activeDropdowns.has(dropdown)) {
          this.closeDropdown(dropdown);
        }
      });
    });
  }

  toggleDropdown(dropdown) {
    const menu = dropdown.querySelector('[data-dropdown-menu]');
    const isOpen = this.activeDropdowns.has(dropdown);

    // Close other dropdowns
    this.activeDropdowns.forEach(d => {
      if (d !== dropdown) this.closeDropdown(d);
    });

    if (isOpen) {
      this.closeDropdown(dropdown);
    } else {
      dropdown.classList.add('active');
      menu.classList.add('active');
      this.activeDropdowns.add(dropdown);

      // Position dropdown if needed
      this.positionDropdown(dropdown);
    }
  }

  closeDropdown(dropdown) {
    const menu = dropdown.querySelector('[data-dropdown-menu]');
    dropdown.classList.remove('active');
    menu.classList.remove('active');
    this.activeDropdowns.delete(dropdown);
  }

  positionDropdown(dropdown) {
    const menu = dropdown.querySelector('[data-dropdown-menu]');
    const rect = menu.getBoundingClientRect();

    // Adjust if menu goes off screen
    if (rect.right > window.innerWidth) {
      menu.style.left = 'auto';
      menu.style.right = '0';
    }

    if (rect.bottom > window.innerHeight) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
    }
  }

  setupActiveStates() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('[data-nav-link]');

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  setupKeyboardNav() {
    // Tab trap for modals and menus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.focusTrapElement) {
        this.handleTabTrap(e);
      }
    });
  }

  trapFocus(element) {
    this.focusTrapElement = element;
    const focusableElements = element.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
    );
    this.firstFocusableElement = focusableElements[0];
    this.lastFocusableElement = focusableElements[focusableElements.length - 1];
    this.firstFocusableElement?.focus();
  }

  releaseFocus() {
    this.focusTrapElement = null;
    this.firstFocusableElement = null;
    this.lastFocusableElement = null;
  }

  handleTabTrap(e) {
    if (e.shiftKey) {
      if (document.activeElement === this.firstFocusableElement) {
        this.lastFocusableElement?.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === this.lastFocusableElement) {
        this.firstFocusableElement?.focus();
        e.preventDefault();
      }
    }
  }

  setupBreadcrumbs() {
    const breadcrumbContainer = document.querySelector('[data-breadcrumbs]');
    if (!breadcrumbContainer) return;

    const path = window.location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [{ label: 'Home', url: '/' }];

    let currentPath = '';
    path.forEach((segment, index) => {
      currentPath += `/${segment}`;

      // Handle special cases
      if (segment === 'c') {
        breadcrumbs.push({ label: 'Communities', url: '/c' });
      } else if (segment === 'u') {
        breadcrumbs.push({ label: 'Users', url: '/u' });
      } else if (path[index - 1] === 'c') {
        breadcrumbs.push({ label: segment, url: currentPath });
      } else if (path[index - 1] === 'u') {
        breadcrumbs.push({ label: `@${segment}`, url: currentPath });
      } else {
        breadcrumbs.push({
          label: segment.charAt(0).toUpperCase() + segment.slice(1),
          url: currentPath
        });
      }
    });

    this.renderBreadcrumbs(breadcrumbContainer, breadcrumbs);
  }

  renderBreadcrumbs(container, breadcrumbs) {
    container.innerHTML = breadcrumbs.map((crumb, index) => {
      const isLast = index === breadcrumbs.length - 1;
      return `
        <li class="breadcrumb-item">
          ${isLast ?
            `<span aria-current="page">${crumb.label}</span>` :
            `<a href="${crumb.url}">${crumb.label}</a>`
          }
          ${!isLast ? '<span class="breadcrumb-separator">/</span>' : ''}
        </li>
      `;
    }).join('');
  }
}

// ===============================================================================
// SEARCH FUNCTIONALITY
// ===============================================================================

class SearchManager {
  constructor() {
    this.searchInput = null;
    this.searchResults = null;
    this.searchOverlay = null;
    this.debounceTimer = null;
    this.currentQuery = '';
    this.init();
  }

  init() {
    this.setupSearchElements();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
  }

  setupSearchElements() {
    this.searchInput = document.querySelector('[data-search-input]');
    this.searchResults = document.querySelector('[data-search-results]');
    this.searchOverlay = document.querySelector('[data-search-overlay]');
  }

  setupEventListeners() {
    if (!this.searchInput) return;

    // Input handler with debounce
    this.searchInput.addEventListener('input', (e) => {
      this.handleSearchInput(e.target.value);
    });

    // Focus/blur handlers
    this.searchInput.addEventListener('focus', () => {
      this.showSearchOverlay();
    });

    // Close on overlay click
    this.searchOverlay?.addEventListener('click', () => {
      this.closeSearch();
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isSearchActive()) {
        this.closeSearch();
      }
    });
  }

  setupKeyboardShortcuts() {
    // Cmd/Ctrl + K to focus search
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.focusSearch();
      }
    });

    // Navigation in search results
    if (this.searchResults) {
      this.searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateResults(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateResults(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.selectCurrentResult();
        }
      });
    }
  }

  handleSearchInput(query) {
    // Clear previous timer
    clearTimeout(this.debounceTimer);

    // Store current query
    this.currentQuery = query;

    // Don't search for very short queries
    if (query.length < AppConfig.search.minChars) {
      this.clearResults();
      return;
    }

    // Debounce the search
    this.debounceTimer = setTimeout(() => {
      this.performSearch(query);
    }, AppConfig.search.debounceMs);
  }

  async performSearch(query) {
    // Show loading state
    this.showLoadingState();

    try {
      // Mock search results - will be replaced with Firebase
      const results = await this.mockSearch(query);
      this.displayResults(results);
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Search failed. Please try again.');
    }
  }

  async mockSearch(query) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock data
    const mockData = {
      posts: [
        { id: 1, title: 'Introduction to Machine Learning', type: 'post', community: 'ai-coding', score: 42 },
        { id: 2, title: 'Best practices for React hooks', type: 'post', community: 'webdev', score: 38 },
        { id: 3, title: 'Understanding neural networks', type: 'post', community: 'ai-coding', score: 31 }
      ],
      users: [
        { id: 1, username: 'john_doe', karma: 1234 },
        { id: 2, username: 'jane_smith', karma: 5678 }
      ],
      communities: [
        { id: 'ai-coding', name: 'AI & Coding', members: 1234 },
        { id: 'webdev', name: 'Web Development', members: 890 }
      ]
    };

    // Filter results based on query
    const lowerQuery = query.toLowerCase();
    return {
      posts: mockData.posts.filter(p => p.title.toLowerCase().includes(lowerQuery)),
      users: mockData.users.filter(u => u.username.toLowerCase().includes(lowerQuery)),
      communities: mockData.communities.filter(c => c.name.toLowerCase().includes(lowerQuery))
    };
  }

  displayResults(results) {
    if (!this.searchResults) return;

    const { posts, users, communities } = results;
    const totalResults = posts.length + users.length + communities.length;

    if (totalResults === 0) {
      this.searchResults.innerHTML = `
        <div class="search-no-results">
          <p>No results found for "${this.currentQuery}"</p>
        </div>
      `;
      return;
    }

    let html = '';

    // Posts section
    if (posts.length > 0) {
      html += `
        <div class="search-section">
          <h4 class="search-section-title">Posts</h4>
          ${posts.map(post => `
            <a href="/c/${post.community}/post/${post.id}" class="search-result" data-search-result>
              <div class="search-result-icon">📝</div>
              <div class="search-result-content">
                <div class="search-result-title">${this.highlightMatch(post.title)}</div>
                <div class="search-result-meta">in r/${post.community} • ${post.score} points</div>
              </div>
            </a>
          `).join('')}
        </div>
      `;
    }

    // Users section
    if (users.length > 0) {
      html += `
        <div class="search-section">
          <h4 class="search-section-title">Users</h4>
          ${users.map(user => `
            <a href="/u/${user.username}" class="search-result" data-search-result>
              <div class="search-result-icon">👤</div>
              <div class="search-result-content">
                <div class="search-result-title">u/${this.highlightMatch(user.username)}</div>
                <div class="search-result-meta">${user.karma} karma</div>
              </div>
            </a>
          `).join('')}
        </div>
      `;
    }

    // Communities section
    if (communities.length > 0) {
      html += `
        <div class="search-section">
          <h4 class="search-section-title">Communities</h4>
          ${communities.map(community => `
            <a href="/c/${community.id}" class="search-result" data-search-result>
              <div class="search-result-icon">👥</div>
              <div class="search-result-content">
                <div class="search-result-title">r/${this.highlightMatch(community.name)}</div>
                <div class="search-result-meta">${community.members} members</div>
              </div>
            </a>
          `).join('')}
        </div>
      `;
    }

    this.searchResults.innerHTML = html;
    this.searchResults.classList.add('active');
  }

  highlightMatch(text) {
    const regex = new RegExp(`(${this.currentQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  navigateResults(direction) {
    const results = this.searchResults?.querySelectorAll('[data-search-result]');
    if (!results || results.length === 0) return;

    const currentIndex = Array.from(results).findIndex(r => r.classList.contains('selected'));
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = results.length - 1;
    if (newIndex >= results.length) newIndex = 0;

    // Update selection
    results.forEach((r, i) => {
      r.classList.toggle('selected', i === newIndex);
    });

    // Scroll into view
    results[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  selectCurrentResult() {
    const selected = this.searchResults?.querySelector('.search-result.selected');
    if (selected) {
      selected.click();
    }
  }

  showLoadingState() {
    if (!this.searchResults) return;
    this.searchResults.innerHTML = `
      <div class="search-loading">
        <div class="spinner"></div>
        <p>Searching...</p>
      </div>
    `;
    this.searchResults.classList.add('active');
  }

  showError(message) {
    if (!this.searchResults) return;
    this.searchResults.innerHTML = `
      <div class="search-error">
        <p>${message}</p>
      </div>
    `;
  }

  clearResults() {
    if (this.searchResults) {
      this.searchResults.innerHTML = '';
      this.searchResults.classList.remove('active');
    }
  }

  focusSearch() {
    this.searchInput?.focus();
    this.searchInput?.select();
  }

  showSearchOverlay() {
    this.searchOverlay?.classList.add('active');
  }

  closeSearch() {
    this.clearResults();
    this.searchOverlay?.classList.remove('active');
    this.searchInput?.blur();
  }

  isSearchActive() {
    return this.searchOverlay?.classList.contains('active');
  }
}

// ===============================================================================
// MODAL MANAGEMENT
// ===============================================================================

class ModalManager {
  constructor() {
    this.activeModals = new Map();
    this.modalStack = [];
    this.init();
  }

  init() {
    this.setupModalTriggers();
    this.setupCloseHandlers();
    this.injectModalContainer();
  }

  injectModalContainer() {
    if (!document.querySelector('#modal-container')) {
      const container = document.createElement('div');
      container.id = 'modal-container';
      document.body.appendChild(container);
    }
  }

  setupModalTriggers() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-modal-trigger]');
      if (trigger) {
        e.preventDefault();
        const modalId = trigger.dataset.modalTrigger;
        this.openModal(modalId);
      }
    });
  }

  setupCloseHandlers() {
    // Close button clicks
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-modal-close]')) {
        this.closeTopModal();
      }
    });

    // Overlay clicks
    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-overlay')) {
        const modal = e.target.closest('.modal-wrapper');
        if (modal && !modal.dataset.modalPersistent) {
          this.closeModal(modal.dataset.modalId);
        }
      }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalStack.length > 0) {
        const topModal = this.modalStack[this.modalStack.length - 1];
        if (!topModal.persistent) {
          this.closeTopModal();
        }
      }
    });
  }

  openModal(modalId, options = {}) {
    // Check if modal already exists
    if (this.activeModals.has(modalId)) {
      console.warn(`Modal ${modalId} is already open`);
      return;
    }

    const modalConfig = {
      id: modalId,
      title: options.title || 'Modal',
      content: options.content || '',
      size: options.size || 'medium', // small, medium, large, fullscreen
      persistent: options.persistent || false,
      closeButton: options.closeButton !== false,
      overlay: options.overlay !== false,
      onOpen: options.onOpen || null,
      onClose: options.onClose || null,
      className: options.className || ''
    };

    const modal = this.createModal(modalConfig);
    this.activeModals.set(modalId, modal);
    this.modalStack.push(modalConfig);

    // Add to DOM
    document.querySelector('#modal-container').appendChild(modal);

    // Trigger animation
    requestAnimationFrame(() => {
      modal.classList.add('active');
      document.body.classList.add('modal-open');
    });

    // Focus management
    this.trapFocus(modal);

    // Callback
    modalConfig.onOpen?.();

    return modal;
  }

  createModal(config) {
    const modal = document.createElement('div');
    modal.className = `modal-wrapper modal-${config.size} ${config.className}`;
    modal.dataset.modalId = config.id;
    if (config.persistent) modal.dataset.modalPersistent = 'true';

    modal.innerHTML = `
      ${config.overlay ? '<div class="modal-overlay"></div>' : ''}
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title-${config.id}">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title-${config.id}">${config.title}</h2>
          ${config.closeButton ? `
            <button class="modal-close-btn" data-modal-close aria-label="Close modal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          ` : ''}
        </div>
        <div class="modal-content">
          ${config.content}
        </div>
      </div>
    `;

    return modal;
  }

  closeModal(modalId) {
    const modal = this.activeModals.get(modalId);
    if (!modal) return;

    const config = this.modalStack.find(m => m.id === modalId);

    // Remove from stack
    this.modalStack = this.modalStack.filter(m => m.id !== modalId);

    // Trigger close animation
    modal.classList.remove('active');

    // Remove after animation
    setTimeout(() => {
      modal.remove();
      this.activeModals.delete(modalId);

      // Remove body class if no more modals
      if (this.modalStack.length === 0) {
        document.body.classList.remove('modal-open');
      }

      // Release focus trap
      this.releaseFocus();

      // Callback
      config?.onClose?.();
    }, 300);
  }

  closeTopModal() {
    if (this.modalStack.length > 0) {
      const topModal = this.modalStack[this.modalStack.length - 1];
      this.closeModal(topModal.id);
    }
  }

  closeAllModals() {
    [...this.activeModals.keys()].forEach(modalId => {
      this.closeModal(modalId);
    });
  }

  trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement.focus();

    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }

  releaseFocus() {
    // Return focus to the element that triggered the modal
    const trigger = document.querySelector('[data-modal-trigger]:focus');
    trigger?.focus();
  }
}

// ===============================================================================
// TOAST NOTIFICATIONS
// ===============================================================================

class ToastManager {
  constructor() {
    this.toasts = new Map();
    this.container = null;
    this.init();
  }

  init() {
    this.createContainer();
  }

  createContainer() {
    if (!document.querySelector('#toast-container')) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = `toast-container toast-${AppConfig.notifications.position}`;
      document.body.appendChild(this.container);
    } else {
      this.container = document.querySelector('#toast-container');
    }
  }

  show(message, options = {}) {
    const id = `toast-${Date.now()}-${Math.random()}`;

    const config = {
      id,
      message,
      type: options.type || 'info', // info, success, warning, error
      duration: options.duration ?? AppConfig.notifications.duration,
      action: options.action || null,
      persistent: options.persistent || false,
      icon: options.icon || this.getDefaultIcon(options.type || 'info')
    };

    const toast = this.createToast(config);
    this.toasts.set(id, { element: toast, config });

    // Add to container
    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('active');
    });

    // Auto dismiss if not persistent
    if (!config.persistent && config.duration > 0) {
      setTimeout(() => this.dismiss(id), config.duration);
    }

    return id;
  }

  createToast(config) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${config.type}`;
    toast.dataset.toastId = config.id;

    toast.innerHTML = `
      <div class="toast-icon">${config.icon}</div>
      <div class="toast-content">
        <div class="toast-message">${config.message}</div>
        ${config.action ? `
          <button class="toast-action" data-toast-action="${config.id}">
            ${config.action.label}
          </button>
        ` : ''}
      </div>
      <button class="toast-close" data-toast-close="${config.id}" aria-label="Dismiss">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 5L5 15M5 5l10 10"/>
        </svg>
      </button>
    `;

    // Event listeners
    const closeBtn = toast.querySelector('[data-toast-close]');
    closeBtn?.addEventListener('click', () => this.dismiss(config.id));

    const actionBtn = toast.querySelector('[data-toast-action]');
    actionBtn?.addEventListener('click', () => {
      config.action?.callback?.();
      this.dismiss(config.id);
    });

    return toast;
  }

  dismiss(id) {
    const toastData = this.toasts.get(id);
    if (!toastData) return;

    const { element } = toastData;
    element.classList.remove('active');
    element.classList.add('dismissing');

    setTimeout(() => {
      element.remove();
      this.toasts.delete(id);
    }, 300);
  }

  dismissAll() {
    this.toasts.forEach((_, id) => this.dismiss(id));
  }

  getDefaultIcon(type) {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type] || icons.info;
  }

  // Convenience methods
  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }

  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error' });
  }
}

// ===============================================================================
// UTILITY FUNCTIONS
// ===============================================================================

const Utils = {
  /**
   * Debounce function execution
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function execution
   */
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Format relative time (e.g., "2 hours ago")
   */
  timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'week', seconds: 604800 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
      { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return count === 1
          ? `1 ${interval.label} ago`
          : `${count} ${interval.label}s ago`;
      }
    }

    return 'just now';
  },

  /**
   * Format large numbers (e.g., 1.2k, 3.4M)
   */
  formatNumber(num) {
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'k';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    return (num / 1000000000).toFixed(1) + 'B';
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  },

  /**
   * Get URL parameters as object
   */
  getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  },

  /**
   * Update URL parameters without page reload
   */
  updateUrlParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.pushState({}, '', url);
  },

  /**
   * Generate unique ID
   */
  generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Deep clone object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  },

  /**
   * Check if element is in viewport
   */
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  /**
   * Load script dynamically
   */
  loadScript(src, async = true) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = async;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  /**
   * Local storage wrapper with JSON support
   */
  storage: {
    get(key) {
      try {
        const item = localStorage.getItem(`${AppConfig.localStorage.prefix}${key}`);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        console.error('Error reading from localStorage:', e);
        return null;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(`${AppConfig.localStorage.prefix}${key}`, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('Error writing to localStorage:', e);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(`${AppConfig.localStorage.prefix}${key}`);
        return true;
      } catch (e) {
        console.error('Error removing from localStorage:', e);
        return false;
      }
    },

    clear() {
      try {
        Object.keys(localStorage)
          .filter(key => key.startsWith(AppConfig.localStorage.prefix))
          .forEach(key => localStorage.removeItem(key));
        return true;
      } catch (e) {
        console.error('Error clearing localStorage:', e);
        return false;
      }
    }
  }
};

// ===============================================================================
// APP INITIALIZATION
// ===============================================================================

class App {
  constructor() {
    this.managers = {};
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    console.log('🚀 Initializing GA Tech Community Platform...');

    // Initialize managers
    this.managers.theme = new ThemeManager();
    this.managers.navigation = new NavigationManager();
    this.managers.search = new SearchManager();
    this.managers.modal = new ModalManager();
    this.managers.toast = new ToastManager();

    // Setup global error handler
    this.setupErrorHandler();

    // Setup performance monitoring
    this.setupPerformanceMonitoring();

    // Mark as initialized
    this.initialized = true;

    console.log('✅ App initialized successfully');

    // Fire custom event
    window.dispatchEvent(new CustomEvent('app:initialized', { detail: this.managers }));
  }

  setupErrorHandler() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.managers.toast?.error('An unexpected error occurred. Please refresh the page.');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.managers.toast?.error('An unexpected error occurred. Please try again.');
    });
  }

  setupPerformanceMonitoring() {
    // Log performance metrics
    if ('PerformanceObserver' in window) {
      // First Contentful Paint
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log(`⚡ ${entry.name}: ${entry.startTime.toFixed(2)}ms`);
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });

      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        console.log(`⚡ LCP: ${lastEntry.startTime.toFixed(2)}ms`);
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    }
  }

  // Public API
  getManager(name) {
    return this.managers[name];
  }

  showToast(message, options) {
    return this.managers.toast?.show(message, options);
  }

  openModal(id, options) {
    return this.managers.modal?.openModal(id, options);
  }

  closeModal(id) {
    return this.managers.modal?.closeModal(id);
  }
}

// ===============================================================================
// INITIALIZE ON DOM READY
// ===============================================================================

// Create global app instance
window.GTApp = new App();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.GTApp.init());
} else {
  window.GTApp.init();
}

// Export for ES modules
export {
  App,
  ThemeManager,
  NavigationManager,
  SearchManager,
  ModalManager,
  ToastManager,
  Utils,
  AppConfig
};