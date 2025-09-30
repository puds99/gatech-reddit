/**
 * ===============================================================================
 * FEED.JS - Feed Page Logic
 * GA Tech AI & Vibe-Coding Community Platform
 * Version: 1.0.0 - ES2025 Modern JavaScript
 * ===============================================================================
 */

// ===============================================================================
// FEED CONFIGURATION
// ===============================================================================

const FeedConfig = {
  postsPerPage: 25,
  infiniteScrollThreshold: 1000, // pixels from bottom
  votingCooldown: 500, // milliseconds between votes
  autoRefreshInterval: 60000, // 1 minute
  cacheExpiry: 300000, // 5 minutes
  sortOptions: ['hot', 'new', 'top', 'controversial', 'rising'],
  timeFilters: ['hour', 'day', 'week', 'month', 'year', 'all']
};

// ===============================================================================
// FEED MANAGER
// ===============================================================================

class FeedManager {
  constructor() {
    this.currentSort = 'hot';
    this.currentTimeFilter = 'day';
    this.currentCommunity = null;
    this.posts = new Map();
    this.isLoading = false;
    this.hasMore = true;
    this.page = 1;
    this.votingQueue = new Set();
    this.observers = new Map();
    this.feedContainer = null;
    this.init();
  }

  init() {
    this.setupElements();
    this.setupEventListeners();
    this.setupInfiniteScroll();
    this.loadInitialFeed();
    this.setupAutoRefresh();
  }

  setupElements() {
    this.feedContainer = document.querySelector('[data-feed-container]');
    this.sortSelector = document.querySelector('[data-sort-selector]');
    this.timeFilter = document.querySelector('[data-time-filter]');
    this.loadingIndicator = document.querySelector('[data-feed-loading]');
    this.emptyMessage = document.querySelector('[data-feed-empty]');
    this.errorMessage = document.querySelector('[data-feed-error]');
  }

  setupEventListeners() {
    // Sort change
    this.sortSelector?.addEventListener('change', (e) => {
      this.changeSort(e.target.value);
    });

    // Time filter change
    this.timeFilter?.addEventListener('change', (e) => {
      this.changeTimeFilter(e.target.value);
    });

    // Vote handlers
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-vote-up]')) {
        const postId = e.target.closest('[data-post-id]')?.dataset.postId;
        if (postId) this.handleVote(postId, 1);
      } else if (e.target.closest('[data-vote-down]')) {
        const postId = e.target.closest('[data-post-id]')?.dataset.postId;
        if (postId) this.handleVote(postId, -1);
      }
    });

    // Post interactions
    document.addEventListener('click', (e) => {
      // Save post
      if (e.target.closest('[data-save-post]')) {
        const postId = e.target.closest('[data-post-id]')?.dataset.postId;
        if (postId) this.handleSavePost(postId);
      }

      // Share post
      if (e.target.closest('[data-share-post]')) {
        const postId = e.target.closest('[data-post-id]')?.dataset.postId;
        if (postId) this.handleSharePost(postId);
      }

      // Hide post
      if (e.target.closest('[data-hide-post]')) {
        const postId = e.target.closest('[data-post-id]')?.dataset.postId;
        if (postId) this.handleHidePost(postId);
      }
    });

    // Filter toggles
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-filter-toggle]')) {
        this.toggleFilters();
      }
    });
  }

  setupInfiniteScroll() {
    if (!this.feedContainer) return;

    const scrollHandler = window.GTApp?.Utils.throttle(() => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - FeedConfig.infiniteScrollThreshold;

      if (scrollPosition >= threshold && !this.isLoading && this.hasMore) {
        this.loadMorePosts();
      }
    }, 200);

    window.addEventListener('scroll', scrollHandler);
    window.addEventListener('resize', scrollHandler);
  }

  setupAutoRefresh() {
    // Only auto-refresh on 'new' sort
    setInterval(() => {
      if (this.currentSort === 'new' && !document.hidden) {
        this.checkForNewPosts();
      }
    }, FeedConfig.autoRefreshInterval);

    // Refresh when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.currentSort === 'new') {
        this.checkForNewPosts();
      }
    });
  }

  // ===============================================================================
  // FEED LOADING
  // ===============================================================================

  async loadInitialFeed() {
    this.isLoading = true;
    this.showLoadingState();

    try {
      const posts = await this.fetchPosts({
        sort: this.currentSort,
        time: this.currentTimeFilter,
        page: 1
      });

      this.posts.clear();
      posts.forEach(post => this.posts.set(post.id, post));

      this.renderPosts(posts);
      this.hideLoadingState();

      if (posts.length < FeedConfig.postsPerPage) {
        this.hasMore = false;
      }
    } catch (error) {
      console.error('Error loading feed:', error);
      this.showErrorState('Failed to load posts. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async loadMorePosts() {
    if (this.isLoading || !this.hasMore) return;

    this.isLoading = true;
    this.showInlineLoading();

    try {
      this.page++;
      const posts = await this.fetchPosts({
        sort: this.currentSort,
        time: this.currentTimeFilter,
        page: this.page
      });

      posts.forEach(post => {
        if (!this.posts.has(post.id)) {
          this.posts.set(post.id, post);
          this.appendPost(post);
        }
      });

      if (posts.length < FeedConfig.postsPerPage) {
        this.hasMore = false;
        this.showEndOfFeed();
      }
    } catch (error) {
      console.error('Error loading more posts:', error);
      window.GTApp?.showToast('Failed to load more posts', { type: 'error' });
    } finally {
      this.isLoading = false;
      this.hideInlineLoading();
    }
  }

  async checkForNewPosts() {
    try {
      const latestPost = Array.from(this.posts.values())[0];
      const newPosts = await this.fetchPosts({
        sort: 'new',
        after: latestPost?.created_at
      });

      if (newPosts.length > 0) {
        this.showNewPostsNotification(newPosts.length);
      }
    } catch (error) {
      console.error('Error checking for new posts:', error);
    }
  }

  async fetchPosts(params) {
    // Mock data - will be replaced with Firebase
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockPosts = this.generateMockPosts(params.page || 1);

    // Apply sorting
    if (params.sort === 'hot') {
      mockPosts.sort((a, b) => b.hotScore - a.hotScore);
    } else if (params.sort === 'new') {
      mockPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (params.sort === 'top') {
      mockPosts.sort((a, b) => b.score - a.score);
    } else if (params.sort === 'controversial') {
      mockPosts.sort((a, b) => b.controversyScore - a.controversyScore);
    }

    return mockPosts;
  }

  generateMockPosts(page) {
    const posts = [];
    const startId = (page - 1) * FeedConfig.postsPerPage;

    for (let i = 1; i <= FeedConfig.postsPerPage; i++) {
      const id = startId + i;
      posts.push({
        id: `post-${id}`,
        title: `Post ${id}: ${this.getRandomTitle()}`,
        content: this.getRandomContent(),
        author: {
          id: `user-${Math.floor(Math.random() * 100)}`,
          username: this.getRandomUsername(),
          avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
          karma: Math.floor(Math.random() * 10000),
          verified: Math.random() > 0.7
        },
        community: {
          id: this.getRandomCommunity(),
          name: this.getRandomCommunityName()
        },
        score: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 200),
        created_at: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
        tags: this.getRandomTags(),
        type: this.getRandomPostType(),
        userVote: 0,
        saved: false,
        hidden: false,
        hotScore: Math.random() * 1000,
        controversyScore: Math.random() * 100
      });
    }

    return posts;
  }

  // ===============================================================================
  // POST RENDERING
  // ===============================================================================

  renderPosts(posts) {
    if (!this.feedContainer) return;

    if (posts.length === 0) {
      this.showEmptyState();
      return;
    }

    const html = posts.map(post => this.createPostHTML(post)).join('');
    this.feedContainer.innerHTML = html;

    // Setup intersection observers for lazy loading
    this.setupPostObservers();
  }

  appendPost(post) {
    if (!this.feedContainer) return;

    const postElement = document.createElement('div');
    postElement.innerHTML = this.createPostHTML(post);
    this.feedContainer.appendChild(postElement.firstElementChild);

    // Observe the new post
    this.observePost(postElement.firstElementChild);
  }

  createPostHTML(post) {
    const timeAgo = window.GTApp?.Utils.timeAgo(post.created_at) || post.created_at;
    const formattedScore = window.GTApp?.Utils.formatNumber(post.score) || post.score;
    const formattedComments = window.GTApp?.Utils.formatNumber(post.comments) || post.comments;

    return `
      <article class="post-card ${post.type}" data-post-id="${post.id}">
        <div class="post-voting">
          <button class="vote-button vote-up ${post.userVote > 0 ? 'voted' : ''}"
                  data-vote-up aria-label="Upvote">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3l7 7h-5v7h-4v-7H3l7-7z"/>
            </svg>
          </button>
          <span class="post-score" data-score="${post.score}">${formattedScore}</span>
          <button class="vote-button vote-down ${post.userVote < 0 ? 'voted' : ''}"
                  data-vote-down aria-label="Downvote">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 17l-7-7h5V3h4v7h5l-7 7z"/>
            </svg>
          </button>
        </div>

        <div class="post-content">
          <div class="post-header">
            <div class="post-meta">
              <a href="/c/${post.community.id}" class="post-community">r/${post.community.name}</a>
              <span class="post-separator">•</span>
              <span class="post-author">
                Posted by
                <a href="/u/${post.author.username}" class="author-link">
                  u/${post.author.username}
                  ${post.author.verified ? '<span class="verified-badge" title="Verified GT Student">✓</span>' : ''}
                </a>
              </span>
              <span class="post-separator">•</span>
              <time class="post-time" datetime="${post.created_at}">${timeAgo}</time>
            </div>
            ${post.tags.length > 0 ? `
              <div class="post-tags">
                ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
              </div>
            ` : ''}
          </div>

          <h2 class="post-title">
            <a href="/c/${post.community.id}/post/${post.id}">${post.title}</a>
          </h2>

          ${post.type === 'text' && post.content ? `
            <div class="post-preview">
              ${this.truncateContent(post.content, 200)}
            </div>
          ` : ''}

          ${post.type === 'link' ? `
            <div class="post-link">
              <a href="${post.content}" target="_blank" rel="noopener noreferrer">
                <span class="link-icon">🔗</span>
                <span class="link-text">${this.extractDomain(post.content)}</span>
              </a>
            </div>
          ` : ''}

          ${post.type === 'vibe-code' ? `
            <div class="post-vibe-code">
              <div class="vibe-code-badge">
                <span class="badge-icon">🤖</span>
                <span class="badge-text">AI Vibe-Code</span>
              </div>
              <pre class="code-preview"><code>${this.truncateContent(post.content, 150)}</code></pre>
            </div>
          ` : ''}

          <div class="post-actions">
            <a href="/c/${post.community.id}/post/${post.id}" class="post-action">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 10c0 3.866-3.134 7-7 7a6.98 6.98 0 01-3.427-.894L3 17l.894-3.573A6.98 6.98 0 013 10c0-3.866 3.134-7 7-7s7 3.134 7 7z"/>
              </svg>
              <span>${formattedComments} Comments</span>
            </a>

            <button class="post-action" data-share-post>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 7l3-3m0 0l-3-3m3 3H8c-2.21 0-4 1.79-4 4v8M6 13l-3 3m0 0l3 3m-3-3h9c2.21 0 4-1.79 4-4V4"/>
              </svg>
              <span>Share</span>
            </button>

            <button class="post-action ${post.saved ? 'saved' : ''}" data-save-post>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="${post.saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M5 4v14l5-3 5 3V4c0-.55-.45-1-1-1H6c-.55 0-1 .45-1 1z"/>
              </svg>
              <span>${post.saved ? 'Saved' : 'Save'}</span>
            </button>

            <button class="post-action post-menu" data-post-menu>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="5" cy="10" r="1.5"/>
                <circle cx="10" cy="10" r="1.5"/>
                <circle cx="15" cy="10" r="1.5"/>
              </svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  truncateContent(content, maxLength) {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  }

  extractDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return url;
    }
  }

  // ===============================================================================
  // VOTING SYSTEM
  // ===============================================================================

  async handleVote(postId, value) {
    // Check if already voting
    if (this.votingQueue.has(postId)) return;

    this.votingQueue.add(postId);

    const post = this.posts.get(postId);
    if (!post) return;

    const previousVote = post.userVote;
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    const scoreElement = postElement?.querySelector('[data-score]');
    const upButton = postElement?.querySelector('[data-vote-up]');
    const downButton = postElement?.querySelector('[data-vote-down]');

    // Calculate new vote state
    let newVote = value;
    let scoreDelta = value;

    if (previousVote === value) {
      // Removing vote
      newVote = 0;
      scoreDelta = -value;
    } else if (previousVote !== 0) {
      // Changing vote
      scoreDelta = value - previousVote;
    }

    // Optimistic update
    post.userVote = newVote;
    post.score += scoreDelta;

    // Update UI
    if (scoreElement) {
      scoreElement.textContent = window.GTApp?.Utils.formatNumber(post.score) || post.score;
      scoreElement.dataset.score = post.score;
    }

    upButton?.classList.toggle('voted', newVote > 0);
    downButton?.classList.toggle('voted', newVote < 0);

    // Animate vote
    this.animateVote(postElement, scoreDelta);

    try {
      // Mock API call - will be replaced with Firebase
      await new Promise(resolve => setTimeout(resolve, 200));

      // Success feedback
      if (newVote !== 0) {
        this.showVoteFeedback(postElement, value > 0 ? 'upvoted' : 'downvoted');
      }
    } catch (error) {
      // Rollback on error
      console.error('Vote failed:', error);
      post.userVote = previousVote;
      post.score -= scoreDelta;

      // Revert UI
      if (scoreElement) {
        scoreElement.textContent = window.GTApp?.Utils.formatNumber(post.score) || post.score;
      }
      upButton?.classList.toggle('voted', previousVote > 0);
      downButton?.classList.toggle('voted', previousVote < 0);

      window.GTApp?.showToast('Vote failed. Please try again.', { type: 'error' });
    } finally {
      // Remove from queue after cooldown
      setTimeout(() => {
        this.votingQueue.delete(postId);
      }, FeedConfig.votingCooldown);
    }
  }

  animateVote(element, delta) {
    if (!element) return;

    const scoreElement = element.querySelector('[data-score]');
    if (!scoreElement) return;

    // Add animation class
    scoreElement.classList.add(delta > 0 ? 'score-up' : 'score-down');

    // Remove after animation
    setTimeout(() => {
      scoreElement.classList.remove('score-up', 'score-down');
    }, 500);
  }

  showVoteFeedback(element, type) {
    const feedback = document.createElement('div');
    feedback.className = `vote-feedback vote-feedback-${type}`;
    feedback.textContent = type === 'upvoted' ? '+1' : '-1';

    element.appendChild(feedback);

    // Animate and remove
    setTimeout(() => {
      feedback.classList.add('animating');
      setTimeout(() => feedback.remove(), 500);
    }, 10);
  }

  // ===============================================================================
  // POST ACTIONS
  // ===============================================================================

  async handleSavePost(postId) {
    const post = this.posts.get(postId);
    if (!post) return;

    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    const saveButton = postElement?.querySelector('[data-save-post]');
    const saveIcon = saveButton?.querySelector('svg');

    // Toggle saved state
    post.saved = !post.saved;

    // Update UI
    saveButton?.classList.toggle('saved', post.saved);
    if (saveIcon) {
      saveIcon.setAttribute('fill', post.saved ? 'currentColor' : 'none');
    }

    const saveText = saveButton?.querySelector('span');
    if (saveText) {
      saveText.textContent = post.saved ? 'Saved' : 'Save';
    }

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 200));

      window.GTApp?.showToast(
        post.saved ? 'Post saved' : 'Post unsaved',
        { type: 'success', duration: 2000 }
      );
    } catch (error) {
      // Rollback
      post.saved = !post.saved;
      saveButton?.classList.toggle('saved', post.saved);

      window.GTApp?.showToast('Failed to save post', { type: 'error' });
    }
  }

  async handleSharePost(postId) {
    const post = this.posts.get(postId);
    if (!post) return;

    const postUrl = `${window.location.origin}/c/${post.community.id}/post/${postId}`;

    // Use native share API if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: `Check out this post on GA Tech Community`,
          url: postUrl
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          this.fallbackShare(postUrl);
        }
      }
    } else {
      this.fallbackShare(postUrl);
    }
  }

  fallbackShare(url) {
    // Copy to clipboard
    window.GTApp?.Utils.copyToClipboard(url).then(success => {
      if (success) {
        window.GTApp?.showToast('Link copied to clipboard', {
          type: 'success',
          action: {
            label: 'Open',
            callback: () => window.open(url, '_blank')
          }
        });
      }
    });
  }

  async handleHidePost(postId) {
    const post = this.posts.get(postId);
    if (!post) return;

    const postElement = document.querySelector(`[data-post-id="${postId}"]`);

    // Animate out
    postElement?.classList.add('hiding');

    setTimeout(() => {
      postElement?.remove();
      this.posts.delete(postId);

      window.GTApp?.showToast('Post hidden', {
        type: 'info',
        action: {
          label: 'Undo',
          callback: () => this.unhidePost(post)
        }
      });
    }, 300);
  }

  unhidePost(post) {
    // Re-add to feed
    this.posts.set(post.id, post);

    // Find correct position and insert
    const allPosts = Array.from(this.posts.values());
    const index = allPosts.findIndex(p => p.id === post.id);

    const postElement = document.createElement('div');
    postElement.innerHTML = this.createPostHTML(post);

    const children = this.feedContainer?.children;
    if (children && children[index]) {
      this.feedContainer.insertBefore(postElement.firstElementChild, children[index]);
    } else {
      this.feedContainer?.appendChild(postElement.firstElementChild);
    }
  }

  // ===============================================================================
  // SORTING & FILTERING
  // ===============================================================================

  async changeSort(sortType) {
    if (!FeedConfig.sortOptions.includes(sortType)) return;

    this.currentSort = sortType;
    this.page = 1;
    this.hasMore = true;

    // Update UI
    if (this.sortSelector) {
      this.sortSelector.value = sortType;
    }

    // Show time filter only for 'top' and 'controversial'
    if (this.timeFilter) {
      this.timeFilter.style.display = ['top', 'controversial'].includes(sortType) ? 'block' : 'none';
    }

    // Reload feed
    await this.loadInitialFeed();

    // Update URL
    window.GTApp?.Utils.updateUrlParams({ sort: sortType });
  }

  async changeTimeFilter(timeFrame) {
    if (!FeedConfig.timeFilters.includes(timeFrame)) return;

    this.currentTimeFilter = timeFrame;
    this.page = 1;
    this.hasMore = true;

    // Update UI
    if (this.timeFilter) {
      this.timeFilter.value = timeFrame;
    }

    // Reload feed
    await this.loadInitialFeed();

    // Update URL
    window.GTApp?.Utils.updateUrlParams({ t: timeFrame });
  }

  toggleFilters() {
    const filterPanel = document.querySelector('[data-filter-panel]');
    filterPanel?.classList.toggle('active');
  }

  // ===============================================================================
  // OBSERVERS & OPTIMIZATION
  // ===============================================================================

  setupPostObservers() {
    const posts = this.feedContainer?.querySelectorAll('[data-post-id]');
    posts?.forEach(post => this.observePost(post));
  }

  observePost(element) {
    // Intersection observer for lazy loading images
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadPostImages(entry.target);
            imageObserver.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '50px'
      });

      const images = element.querySelectorAll('img[data-src]');
      images.forEach(img => imageObserver.observe(img));

      this.observers.set(element, imageObserver);
    }
  }

  loadPostImages(element) {
    const images = element.querySelectorAll('img[data-src]');
    images.forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }

  // ===============================================================================
  // UI STATE MANAGEMENT
  // ===============================================================================

  showLoadingState() {
    this.feedContainer?.classList.add('loading');
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'block';
    }
  }

  hideLoadingState() {
    this.feedContainer?.classList.remove('loading');
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'none';
    }
  }

  showInlineLoading() {
    const loader = document.createElement('div');
    loader.className = 'inline-loader';
    loader.innerHTML = `
      <div class="spinner"></div>
      <p>Loading more posts...</p>
    `;
    this.feedContainer?.appendChild(loader);
  }

  hideInlineLoading() {
    const loader = this.feedContainer?.querySelector('.inline-loader');
    loader?.remove();
  }

  showEmptyState() {
    if (this.emptyMessage) {
      this.emptyMessage.style.display = 'block';
      this.emptyMessage.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No posts yet</h3>
          <p>Be the first to post in this community!</p>
          <a href="/create-post" class="btn btn-primary">Create Post</a>
        </div>
      `;
    }
  }

  showErrorState(message) {
    if (this.errorMessage) {
      this.errorMessage.style.display = 'block';
      this.errorMessage.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Something went wrong</h3>
          <p>${message}</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
        </div>
      `;
    }
  }

  showEndOfFeed() {
    const endMessage = document.createElement('div');
    endMessage.className = 'end-of-feed';
    endMessage.innerHTML = `
      <div class="end-message">
        <p>You've reached the end!</p>
        <button class="btn btn-secondary" onclick="window.scrollTo(0, 0)">Back to Top</button>
      </div>
    `;
    this.feedContainer?.appendChild(endMessage);
  }

  showNewPostsNotification(count) {
    const notification = document.createElement('div');
    notification.className = 'new-posts-notification';
    notification.innerHTML = `
      <button class="new-posts-btn">
        <span class="notification-icon">🆕</span>
        <span>${count} new ${count === 1 ? 'post' : 'posts'}</span>
      </button>
    `;

    notification.querySelector('button').addEventListener('click', () => {
      window.scrollTo(0, 0);
      this.loadInitialFeed();
      notification.remove();
    });

    document.body.appendChild(notification);

    // Auto-hide after 10 seconds
    setTimeout(() => notification.remove(), 10000);
  }

  // ===============================================================================
  // HELPER METHODS
  // ===============================================================================

  getRandomTitle() {
    const titles = [
      'How to implement binary trees in Python',
      'My experience with the new AI model',
      'Best VS Code extensions for 2025',
      'Understanding async/await in JavaScript',
      'Machine Learning project ideas for beginners',
      'CS 1332 Data Structures study guide',
      'Tips for technical interviews at FAANG',
      'Building a Reddit clone with Firebase',
      'Introduction to quantum computing',
      'Web3 development roadmap for 2025'
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  getRandomContent() {
    const contents = [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      'Here\'s a quick tip for debugging JavaScript: Use console.table() for better visualization of arrays and objects.',
      'Just finished my first hackathon at GT! Amazing experience working with talented developers.',
      'Looking for study partners for CS 3600 AI. Meeting at Klaus building every Tuesday.',
      'Check out this cool algorithm visualization tool I built over the weekend.'
    ];
    return contents[Math.floor(Math.random() * contents.length)];
  }

  getRandomUsername() {
    const usernames = [
      'buzz_coder', 'ramblin_dev', 'tech_wreck', 'yellow_jacket_42',
      'gt_programmer', 'klaus_warrior', 'coc_student', 'hackgt_winner'
    ];
    return usernames[Math.floor(Math.random() * usernames.length)];
  }

  getRandomCommunity() {
    const communities = ['ai-coding', 'webdev', 'cs1332', 'hackgt', 'career'];
    return communities[Math.floor(Math.random() * communities.length)];
  }

  getRandomCommunityName() {
    const names = {
      'ai-coding': 'AI & Coding',
      'webdev': 'Web Development',
      'cs1332': 'CS 1332 - Data Structures',
      'hackgt': 'HackGT',
      'career': 'Career Advice'
    };
    return names[this.getRandomCommunity()] || 'General';
  }

  getRandomTags() {
    const allTags = ['help', 'discussion', 'project', 'resource', 'question', 'tutorial'];
    const numTags = Math.floor(Math.random() * 3);
    const tags = [];

    for (let i = 0; i < numTags; i++) {
      const tag = allTags[Math.floor(Math.random() * allTags.length)];
      if (!tags.includes(tag)) tags.push(tag);
    }

    return tags;
  }

  getRandomPostType() {
    const types = ['text', 'link', 'vibe-code'];
    const weights = [0.7, 0.2, 0.1]; // 70% text, 20% link, 10% vibe-code

    const random = Math.random();
    let sum = 0;

    for (let i = 0; i < types.length; i++) {
      sum += weights[i];
      if (random < sum) return types[i];
    }

    return 'text';
  }
}

// ===============================================================================
// COMMENT COUNT UPDATER
// ===============================================================================

class CommentCountUpdater {
  constructor() {
    this.updateInterval = 30000; // 30 seconds
    this.init();
  }

  init() {
    // Update counts periodically
    setInterval(() => {
      this.updateAllCounts();
    }, this.updateInterval);

    // Update when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.updateAllCounts();
      }
    });
  }

  async updateAllCounts() {
    const posts = document.querySelectorAll('[data-post-id]');
    const postIds = Array.from(posts).map(p => p.dataset.postId);

    if (postIds.length === 0) return;

    try {
      // Mock API call - will be replaced with Firebase
      const counts = await this.fetchCommentCounts(postIds);

      counts.forEach(({ postId, count }) => {
        this.updatePostCommentCount(postId, count);
      });
    } catch (error) {
      console.error('Failed to update comment counts:', error);
    }
  }

  async fetchCommentCounts(postIds) {
    // Mock data
    await new Promise(resolve => setTimeout(resolve, 500));

    return postIds.map(id => ({
      postId: id,
      count: Math.floor(Math.random() * 200)
    }));
  }

  updatePostCommentCount(postId, count) {
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    const commentElement = postElement?.querySelector('.post-action span');

    if (commentElement && commentElement.textContent.includes('Comments')) {
      const formattedCount = window.GTApp?.Utils.formatNumber(count) || count;
      commentElement.textContent = `${formattedCount} Comments`;

      // Highlight if count increased
      const previousCount = parseInt(commentElement.dataset.count || '0');
      if (count > previousCount) {
        commentElement.classList.add('count-increased');
        setTimeout(() => {
          commentElement.classList.remove('count-increased');
        }, 2000);
      }

      commentElement.dataset.count = count;
    }
  }
}

// ===============================================================================
// INITIALIZATION
// ===============================================================================

// Initialize feed manager when DOM is ready
if (document.querySelector('[data-feed-container]')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.feedManager = new FeedManager();
      window.commentUpdater = new CommentCountUpdater();
    });
  } else {
    window.feedManager = new FeedManager();
    window.commentUpdater = new CommentCountUpdater();
  }
}

// Export for ES modules
export { FeedManager, CommentCountUpdater, FeedConfig };