/**
 * ===============================================================================
 * PROFILE.JS - User Profile Logic
 * GA Tech AI & Vibe-Coding Community Platform
 * Version: 1.0.0 - ES2025 Modern JavaScript
 * ===============================================================================
 */

// ===============================================================================
// PROFILE CONFIGURATION
// ===============================================================================

const ProfileConfig = {
  itemsPerPage: 25,
  avatarMaxSize: 5242880, // 5MB
  avatarTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  bioMaxLength: 500,
  displayNameMaxLength: 30,
  tabTypes: ['overview', 'posts', 'comments', 'saved', 'upvoted', 'downvoted', 'awards'],
  statsUpdateInterval: 60000, // 1 minute
  trophies: [
    { id: 'verified', name: 'Verified GT Student', icon: '✓', condition: 'gatech_verified' },
    { id: 'karma100', name: 'Century Club', icon: '💯', condition: 'karma >= 100' },
    { id: 'karma1000', name: 'Thousand Club', icon: '🏆', condition: 'karma >= 1000' },
    { id: 'yearClub', name: 'One Year Club', icon: '🎂', condition: 'account_age >= 365' },
    { id: 'contributor', name: 'Top Contributor', icon: '⭐', condition: 'top_contributor' }
  ]
};

// ===============================================================================
// PROFILE MANAGER
// ===============================================================================

class ProfileManager {
  constructor() {
    this.username = this.getUsernameFromUrl();
    this.isOwnProfile = false;
    this.userData = null;
    this.activeTab = 'overview';
    this.currentPage = 1;
    this.isLoading = false;
    this.hasMore = true;
    this.contentCache = new Map();
    this.init();
  }

  init() {
    this.setupElements();
    this.checkIfOwnProfile();
    this.loadUserProfile();
    this.setupEventListeners();
    this.setupInfiniteScroll();
    this.startStatsUpdater();
  }

  getUsernameFromUrl() {
    const pathParts = window.location.pathname.split('/');
    const userIndex = pathParts.indexOf('u');
    return userIndex !== -1 ? pathParts[userIndex + 1] : null;
  }

  setupElements() {
    this.profileContainer = document.querySelector('[data-profile-container]');
    this.profileHeader = document.querySelector('[data-profile-header]');
    this.profileTabs = document.querySelector('[data-profile-tabs]');
    this.tabContent = document.querySelector('[data-tab-content]');
    this.editButton = document.querySelector('[data-edit-profile]');
    this.followButton = document.querySelector('[data-follow-user]');
    this.messageButton = document.querySelector('[data-message-user]');
    this.blockButton = document.querySelector('[data-block-user]');
    this.reportButton = document.querySelector('[data-report-user]');
  }

  async checkIfOwnProfile() {
    // Mock check - will be replaced with Firebase auth
    const currentUser = 'current_user'; // Mock current user
    this.isOwnProfile = this.username === currentUser;

    // Show/hide appropriate buttons
    if (this.editButton) this.editButton.style.display = this.isOwnProfile ? 'block' : 'none';
    if (this.followButton) this.followButton.style.display = this.isOwnProfile ? 'none' : 'block';
    if (this.messageButton) this.messageButton.style.display = this.isOwnProfile ? 'none' : 'block';
  }

  setupEventListeners() {
    // Tab switching
    this.profileTabs?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Edit profile
    this.editButton?.addEventListener('click', () => {
      this.openEditModal();
    });

    // Follow/unfollow
    this.followButton?.addEventListener('click', () => {
      this.toggleFollow();
    });

    // Message user
    this.messageButton?.addEventListener('click', () => {
      this.openMessageModal();
    });

    // Block user
    this.blockButton?.addEventListener('click', () => {
      this.blockUser();
    });

    // Report user
    this.reportButton?.addEventListener('click', () => {
      this.reportUser();
    });

    // Content interactions
    document.addEventListener('click', (e) => {
      // Delete item
      if (e.target.closest('[data-delete-item]')) {
        const itemId = e.target.closest('[data-item-id]')?.dataset.itemId;
        const itemType = e.target.closest('[data-item-type]')?.dataset.itemType;
        if (itemId && itemType) this.deleteItem(itemId, itemType);
      }

      // Edit item
      if (e.target.closest('[data-edit-item]')) {
        const itemId = e.target.closest('[data-item-id]')?.dataset.itemId;
        const itemType = e.target.closest('[data-item-type]')?.dataset.itemType;
        if (itemId && itemType) this.editItem(itemId, itemType);
      }
    });
  }

  setupInfiniteScroll() {
    const scrollHandler = window.GTApp?.Utils.throttle(() => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 1000;

      if (scrollPosition >= threshold && !this.isLoading && this.hasMore) {
        this.loadMoreContent();
      }
    }, 200);

    window.addEventListener('scroll', scrollHandler);
  }

  // ===============================================================================
  // PROFILE LOADING
  // ===============================================================================

  async loadUserProfile() {
    if (!this.username) {
      this.showErrorState('User not found');
      return;
    }

    this.showLoadingState();

    try {
      this.userData = await this.fetchUserData(this.username);
      this.renderProfile();
      this.loadTabContent(this.activeTab);
    } catch (error) {
      console.error('Error loading profile:', error);
      this.showErrorState('Failed to load profile');
    }
  }

  async fetchUserData(username) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock user data
    return {
      id: 'user-123',
      username: username,
      displayName: 'John Doe',
      avatar: `https://i.pravatar.cc/200?u=${username}`,
      bio: 'CS Major at Georgia Tech | Machine Learning enthusiast | Open source contributor',
      karma: {
        post: 1234,
        comment: 5678,
        total: 6912
      },
      cakeDay: '2023-01-15',
      verified: true,
      trophies: ['verified', 'karma1000', 'yearClub'],
      stats: {
        posts: 42,
        comments: 256,
        awardsGiven: 15,
        awardsReceived: 8
      },
      social: {
        github: 'johndoe',
        linkedin: 'john-doe',
        website: 'https://johndoe.com'
      },
      following: 123,
      followers: 456,
      isFollowing: false,
      isBlocked: false
    };
  }

  renderProfile() {
    if (!this.profileHeader || !this.userData) return;

    const joinDate = new Date(this.userData.cakeDay);
    const accountAge = Math.floor((Date.now() - joinDate) / (1000 * 60 * 60 * 24));

    this.profileHeader.innerHTML = `
      <div class="profile-banner"></div>

      <div class="profile-main">
        <div class="profile-avatar-section">
          <div class="profile-avatar">
            <img src="${this.userData.avatar}" alt="${this.userData.username}">
            ${this.isOwnProfile ? `
              <button class="avatar-edit" data-edit-avatar>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="profile-info">
          <div class="profile-name">
            <h1 class="profile-display-name">
              ${this.userData.displayName || this.userData.username}
              ${this.userData.verified ? '<span class="verified-badge" title="Verified GT Student">✓</span>' : ''}
            </h1>
            <p class="profile-username">u/${this.userData.username}</p>
          </div>

          ${this.userData.bio ? `
            <p class="profile-bio">${this.userData.bio}</p>
          ` : ''}

          <div class="profile-meta">
            <div class="profile-stat">
              <span class="stat-value">${window.GTApp?.Utils.formatNumber(this.userData.karma.total)}</span>
              <span class="stat-label">Karma</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${window.GTApp?.Utils.formatNumber(this.userData.followers)}</span>
              <span class="stat-label">Followers</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${window.GTApp?.Utils.formatNumber(this.userData.following)}</span>
              <span class="stat-label">Following</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${accountAge}d</span>
              <span class="stat-label">Account Age</span>
            </div>
          </div>

          ${this.userData.social && Object.keys(this.userData.social).length > 0 ? `
            <div class="profile-social">
              ${this.userData.social.github ? `
                <a href="https://github.com/${this.userData.social.github}" target="_blank" class="social-link">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.138 18.163 20 14.418 20 10c0-5.523-4.477-10-10-10z"/>
                  </svg>
                </a>
              ` : ''}
              ${this.userData.social.linkedin ? `
                <a href="https://linkedin.com/in/${this.userData.social.linkedin}" target="_blank" class="social-link">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z"/>
                  </svg>
                </a>
              ` : ''}
              ${this.userData.social.website ? `
                <a href="${this.userData.social.website}" target="_blank" class="social-link">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="10" cy="10" r="8"/>
                    <path d="M2 10h16M10 2a15.3 15.3 0 014 8 15.3 15.3 0 01-4 8 15.3 15.3 0 01-4-8 15.3 15.3 0 014-8z"/>
                  </svg>
                </a>
              ` : ''}
            </div>
          ` : ''}

          <div class="profile-actions">
            ${this.isOwnProfile ? `
              <button class="btn btn-primary" data-edit-profile>Edit Profile</button>
              <button class="btn btn-secondary" data-view-settings>Settings</button>
            ` : `
              <button class="btn btn-primary ${this.userData.isFollowing ? 'following' : ''}" data-follow-user>
                ${this.userData.isFollowing ? 'Following' : 'Follow'}
              </button>
              <button class="btn btn-secondary" data-message-user>Message</button>
              <button class="btn btn-ghost" data-more-options>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="5" cy="10" r="1.5"/>
                  <circle cx="10" cy="10" r="1.5"/>
                  <circle cx="15" cy="10" r="1.5"/>
                </svg>
              </button>
            `}
          </div>
        </div>

        ${this.userData.trophies && this.userData.trophies.length > 0 ? `
          <div class="profile-trophies">
            <h3>Trophies</h3>
            <div class="trophy-list">
              ${this.userData.trophies.map(trophyId => {
                const trophy = ProfileConfig.trophies.find(t => t.id === trophyId);
                return trophy ? `
                  <div class="trophy" title="${trophy.name}">
                    <span class="trophy-icon">${trophy.icon}</span>
                    <span class="trophy-name">${trophy.name}</span>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Setup avatar edit if own profile
    if (this.isOwnProfile) {
      const avatarEditBtn = this.profileHeader.querySelector('[data-edit-avatar]');
      avatarEditBtn?.addEventListener('click', () => this.openAvatarUpload());
    }

    // Render tabs
    this.renderTabs();
  }

  renderTabs() {
    if (!this.profileTabs) return;

    const tabs = this.isOwnProfile
      ? ProfileConfig.tabTypes
      : ProfileConfig.tabTypes.filter(t => !['saved', 'upvoted', 'downvoted'].includes(t));

    this.profileTabs.innerHTML = tabs.map(tab => `
      <button class="profile-tab ${tab === this.activeTab ? 'active' : ''}" data-tab="${tab}">
        ${this.getTabLabel(tab)}
      </button>
    `).join('');
  }

  getTabLabel(tab) {
    const labels = {
      overview: 'Overview',
      posts: 'Posts',
      comments: 'Comments',
      saved: 'Saved',
      upvoted: 'Upvoted',
      downvoted: 'Downvoted',
      awards: 'Awards'
    };
    return labels[tab] || tab;
  }

  // ===============================================================================
  // TAB CONTENT MANAGEMENT
  // ===============================================================================

  async switchTab(tab) {
    if (!ProfileConfig.tabTypes.includes(tab) || tab === this.activeTab) return;

    // Update active tab
    this.activeTab = tab;
    this.currentPage = 1;
    this.hasMore = true;

    // Update UI
    this.profileTabs?.querySelectorAll('[data-tab]').forEach(tabBtn => {
      tabBtn.classList.toggle('active', tabBtn.dataset.tab === tab);
    });

    // Load content
    await this.loadTabContent(tab);
  }

  async loadTabContent(tab) {
    // Check cache first
    const cacheKey = `${tab}-${this.currentPage}`;
    if (this.contentCache.has(cacheKey)) {
      this.renderTabContent(this.contentCache.get(cacheKey));
      return;
    }

    this.showTabLoading();

    try {
      const content = await this.fetchTabContent(tab, this.currentPage);
      this.contentCache.set(cacheKey, content);
      this.renderTabContent(content);
    } catch (error) {
      console.error(`Error loading ${tab} content:`, error);
      this.showTabError(`Failed to load ${tab}`);
    }
  }

  async fetchTabContent(tab, page) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock content based on tab
    switch (tab) {
      case 'overview':
        return this.generateOverviewContent();
      case 'posts':
        return this.generatePostsContent(page);
      case 'comments':
        return this.generateCommentsContent(page);
      case 'saved':
        return this.generateSavedContent(page);
      case 'upvoted':
        return this.generateUpvotedContent(page);
      case 'downvoted':
        return this.generateDownvotedContent(page);
      case 'awards':
        return this.generateAwardsContent();
      default:
        return { items: [], hasMore: false };
    }
  }

  generateOverviewContent() {
    return {
      recentPosts: [
        {
          id: 'post-1',
          title: 'My experience with the new AI model',
          community: 'ai-coding',
          score: 234,
          comments: 45,
          created_at: new Date(Date.now() - 86400000).toISOString()
        }
      ],
      recentComments: [
        {
          id: 'comment-1',
          content: 'Great implementation! Have you considered using async/await here?',
          postTitle: 'JavaScript Best Practices',
          score: 12,
          created_at: new Date(Date.now() - 3600000).toISOString()
        }
      ],
      topPosts: [
        {
          id: 'post-2',
          title: 'Building a Reddit Clone with Firebase',
          community: 'webdev',
          score: 1234,
          comments: 89,
          created_at: new Date(Date.now() - 604800000).toISOString()
        }
      ]
    };
  }

  generatePostsContent(page) {
    const posts = [];
    for (let i = 0; i < ProfileConfig.itemsPerPage; i++) {
      posts.push({
        id: `post-${page}-${i}`,
        title: `Post ${(page - 1) * ProfileConfig.itemsPerPage + i + 1}: Sample Title`,
        community: ['ai-coding', 'webdev', 'career'][Math.floor(Math.random() * 3)],
        score: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 100),
        created_at: new Date(Date.now() - Math.random() * 2592000000).toISOString()
      });
    }
    return { items: posts, hasMore: page < 5 };
  }

  generateCommentsContent(page) {
    const comments = [];
    for (let i = 0; i < ProfileConfig.itemsPerPage; i++) {
      comments.push({
        id: `comment-${page}-${i}`,
        content: `This is comment ${(page - 1) * ProfileConfig.itemsPerPage + i + 1}. It contains some thoughtful analysis...`,
        postTitle: `Post Title ${Math.floor(Math.random() * 100)}`,
        postId: `post-${Math.floor(Math.random() * 100)}`,
        community: ['ai-coding', 'webdev', 'career'][Math.floor(Math.random() * 3)],
        score: Math.floor(Math.random() * 100),
        created_at: new Date(Date.now() - Math.random() * 2592000000).toISOString()
      });
    }
    return { items: comments, hasMore: page < 5 };
  }

  generateSavedContent(page) {
    // Mix of posts and comments
    const saved = [];
    for (let i = 0; i < ProfileConfig.itemsPerPage; i++) {
      const isPost = Math.random() > 0.5;
      saved.push({
        id: `${isPost ? 'post' : 'comment'}-saved-${page}-${i}`,
        type: isPost ? 'post' : 'comment',
        title: isPost ? `Saved Post ${i}` : undefined,
        content: !isPost ? `Saved comment content ${i}` : undefined,
        postTitle: !isPost ? `Parent Post ${i}` : undefined,
        community: ['ai-coding', 'webdev', 'career'][Math.floor(Math.random() * 3)],
        score: Math.floor(Math.random() * 100),
        created_at: new Date(Date.now() - Math.random() * 2592000000).toISOString()
      });
    }
    return { items: saved, hasMore: page < 3 };
  }

  generateUpvotedContent(page) {
    return this.generatePostsContent(page);
  }

  generateDownvotedContent(page) {
    return this.generatePostsContent(page);
  }

  generateAwardsContent() {
    return {
      given: [
        { type: 'gold', count: 2, totalSpent: 1000 },
        { type: 'silver', count: 5, totalSpent: 500 },
        { type: 'helpful', count: 8, totalSpent: 200 }
      ],
      received: [
        { type: 'gold', count: 1, from: 'anonymous' },
        { type: 'silver', count: 3, from: 'various' },
        { type: 'wholesome', count: 4, from: 'various' }
      ]
    };
  }

  renderTabContent(content) {
    if (!this.tabContent) return;

    let html = '';

    switch (this.activeTab) {
      case 'overview':
        html = this.renderOverview(content);
        break;
      case 'posts':
        html = this.renderPosts(content.items);
        break;
      case 'comments':
        html = this.renderComments(content.items);
        break;
      case 'saved':
      case 'upvoted':
      case 'downvoted':
        html = this.renderMixed(content.items);
        break;
      case 'awards':
        html = this.renderAwards(content);
        break;
    }

    if (this.currentPage === 1) {
      this.tabContent.innerHTML = html;
    } else {
      this.tabContent.insertAdjacentHTML('beforeend', html);
    }

    this.hasMore = content.hasMore || false;
  }

  renderOverview(content) {
    return `
      <div class="profile-overview">
        ${content.recentPosts?.length > 0 ? `
          <section class="overview-section">
            <h3>Recent Posts</h3>
            <div class="overview-posts">
              ${this.renderPosts(content.recentPosts)}
            </div>
          </section>
        ` : ''}

        ${content.recentComments?.length > 0 ? `
          <section class="overview-section">
            <h3>Recent Comments</h3>
            <div class="overview-comments">
              ${this.renderComments(content.recentComments)}
            </div>
          </section>
        ` : ''}

        ${content.topPosts?.length > 0 ? `
          <section class="overview-section">
            <h3>Top Posts</h3>
            <div class="overview-posts">
              ${this.renderPosts(content.topPosts)}
            </div>
          </section>
        ` : ''}
      </div>
    `;
  }

  renderPosts(posts) {
    return posts.map(post => `
      <article class="profile-post" data-item-id="${post.id}" data-item-type="post">
        <div class="post-header">
          <a href="/c/${post.community}" class="post-community">r/${post.community}</a>
          <span class="separator">•</span>
          <time>${window.GTApp?.Utils.timeAgo(post.created_at)}</time>
        </div>
        <h3 class="post-title">
          <a href="/c/${post.community}/post/${post.id}">${post.title}</a>
        </h3>
        <div class="post-stats">
          <span class="post-score">${window.GTApp?.Utils.formatNumber(post.score)} points</span>
          <span class="separator">•</span>
          <span class="post-comments">${post.comments} comments</span>
          ${this.isOwnProfile ? `
            <span class="separator">•</span>
            <button class="post-action" data-edit-item>Edit</button>
            <button class="post-action" data-delete-item>Delete</button>
          ` : ''}
        </div>
      </article>
    `).join('');
  }

  renderComments(comments) {
    return comments.map(comment => `
      <article class="profile-comment" data-item-id="${comment.id}" data-item-type="comment">
        <div class="comment-header">
          <span class="comment-context">on</span>
          <a href="/c/${comment.community}/post/${comment.postId}" class="comment-post-title">
            ${comment.postTitle}
          </a>
          <span class="separator">•</span>
          <a href="/c/${comment.community}" class="comment-community">r/${comment.community}</a>
          <span class="separator">•</span>
          <time>${window.GTApp?.Utils.timeAgo(comment.created_at)}</time>
        </div>
        <div class="comment-content">${comment.content}</div>
        <div class="comment-stats">
          <span class="comment-score">${window.GTApp?.Utils.formatNumber(comment.score)} points</span>
          ${this.isOwnProfile ? `
            <span class="separator">•</span>
            <button class="comment-action" data-edit-item>Edit</button>
            <button class="comment-action" data-delete-item>Delete</button>
          ` : ''}
        </div>
      </article>
    `).join('');
  }

  renderMixed(items) {
    return items.map(item => {
      if (item.type === 'post') {
        return this.renderPosts([item]);
      } else {
        return this.renderComments([item]);
      }
    }).join('');
  }

  renderAwards(content) {
    return `
      <div class="profile-awards">
        <section class="awards-section">
          <h3>Awards Given</h3>
          <div class="awards-list">
            ${content.given?.map(award => `
              <div class="award-item">
                <span class="award-icon">${this.getAwardIcon(award.type)}</span>
                <span class="award-name">${award.type}</span>
                <span class="award-count">×${award.count}</span>
                <span class="award-spent">${award.totalSpent} coins</span>
              </div>
            `).join('') || '<p>No awards given yet</p>'}
          </div>
        </section>

        <section class="awards-section">
          <h3>Awards Received</h3>
          <div class="awards-list">
            ${content.received?.map(award => `
              <div class="award-item">
                <span class="award-icon">${this.getAwardIcon(award.type)}</span>
                <span class="award-name">${award.type}</span>
                <span class="award-count">×${award.count}</span>
              </div>
            `).join('') || '<p>No awards received yet</p>'}
          </div>
        </section>
      </div>
    `;
  }

  getAwardIcon(type) {
    const icons = {
      gold: '🏆',
      silver: '🥈',
      bronze: '🥉',
      helpful: '🤝',
      wholesome: '🤗'
    };
    return icons[type] || '⭐';
  }

  async loadMoreContent() {
    if (this.isLoading || !this.hasMore) return;

    this.isLoading = true;
    this.currentPage++;

    try {
      await this.loadTabContent(this.activeTab);
    } catch (error) {
      console.error('Error loading more content:', error);
      this.currentPage--;
    } finally {
      this.isLoading = false;
    }
  }

  // ===============================================================================
  // PROFILE EDITING
  // ===============================================================================

  openEditModal() {
    const modal = window.GTApp?.openModal('edit-profile', {
      title: 'Edit Profile',
      content: this.getEditModalContent(),
      size: 'medium',
      onOpen: () => this.setupEditModalHandlers()
    });
  }

  getEditModalContent() {
    return `
      <form class="edit-profile-form">
        <div class="form-group">
          <label for="display-name">Display Name</label>
          <input type="text" id="display-name" name="displayName"
                 value="${this.userData?.displayName || ''}"
                 maxlength="${ProfileConfig.displayNameMaxLength}"
                 placeholder="Display name (optional)">
          <span class="char-counter">0 / ${ProfileConfig.displayNameMaxLength}</span>
        </div>

        <div class="form-group">
          <label for="bio">Bio</label>
          <textarea id="bio" name="bio" rows="4"
                    maxlength="${ProfileConfig.bioMaxLength}"
                    placeholder="Tell us about yourself...">${this.userData?.bio || ''}</textarea>
          <span class="char-counter">0 / ${ProfileConfig.bioMaxLength}</span>
        </div>

        <div class="form-group">
          <label>Social Links</label>
          <div class="social-inputs">
            <div class="input-group">
              <span class="input-prefix">github.com/</span>
              <input type="text" name="github" value="${this.userData?.social?.github || ''}"
                     placeholder="username">
            </div>
            <div class="input-group">
              <span class="input-prefix">linkedin.com/in/</span>
              <input type="text" name="linkedin" value="${this.userData?.social?.linkedin || ''}"
                     placeholder="username">
            </div>
            <div class="input-group">
              <input type="url" name="website" value="${this.userData?.social?.website || ''}"
                     placeholder="https://yourwebsite.com">
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
        </div>
      </form>
    `;
  }

  setupEditModalHandlers() {
    const form = document.querySelector('.edit-profile-form');
    if (!form) return;

    // Character counters
    form.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(input => {
      const counter = input.parentElement.querySelector('.char-counter');
      const updateCounter = () => {
        if (counter) {
          counter.textContent = `${input.value.length} / ${input.maxLength}`;
        }
      };
      updateCounter();
      input.addEventListener('input', updateCounter);
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProfile(new FormData(form));
    });

    // Cancel button
    form.querySelector('[data-close-modal]')?.addEventListener('click', () => {
      window.GTApp?.closeModal('edit-profile');
    });
  }

  async saveProfile(formData) {
    const profileData = {
      displayName: formData.get('displayName'),
      bio: formData.get('bio'),
      social: {
        github: formData.get('github'),
        linkedin: formData.get('linkedin'),
        website: formData.get('website')
      }
    };

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update local data
      Object.assign(this.userData, profileData);

      // Re-render profile
      this.renderProfile();

      window.GTApp?.closeModal('edit-profile');
      window.GTApp?.showToast('Profile updated successfully', { type: 'success' });
    } catch (error) {
      console.error('Failed to save profile:', error);
      window.GTApp?.showToast('Failed to update profile', { type: 'error' });
    }
  }

  // ===============================================================================
  // AVATAR UPLOAD
  // ===============================================================================

  openAvatarUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ProfileConfig.avatarTypes.join(',');

    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await this.uploadAvatar(file);
      }
    });

    input.click();
  }

  async uploadAvatar(file) {
    // Validate file
    if (!ProfileConfig.avatarTypes.includes(file.type)) {
      window.GTApp?.showToast('Invalid file type. Please use JPEG, PNG, GIF, or WebP', { type: 'error' });
      return;
    }

    if (file.size > ProfileConfig.avatarMaxSize) {
      window.GTApp?.showToast('File too large. Maximum size is 5MB', { type: 'error' });
      return;
    }

    // Show loading
    const avatarImg = document.querySelector('.profile-avatar img');
    if (avatarImg) {
      avatarImg.style.opacity = '0.5';
    }

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (avatarImg) {
          avatarImg.src = e.target.result;
          avatarImg.style.opacity = '1';
        }
      };
      reader.readAsDataURL(file);

      // Mock upload
      await new Promise(resolve => setTimeout(resolve, 1500));

      window.GTApp?.showToast('Avatar updated successfully', { type: 'success' });
    } catch (error) {
      console.error('Avatar upload failed:', error);

      // Restore original avatar
      if (avatarImg && this.userData?.avatar) {
        avatarImg.src = this.userData.avatar;
        avatarImg.style.opacity = '1';
      }

      window.GTApp?.showToast('Failed to upload avatar', { type: 'error' });
    }
  }

  // ===============================================================================
  // USER INTERACTIONS
  // ===============================================================================

  async toggleFollow() {
    if (!this.userData) return;

    const button = document.querySelector('[data-follow-user]');
    const wasFollowing = this.userData.isFollowing;

    // Optimistic update
    this.userData.isFollowing = !wasFollowing;
    if (button) {
      button.textContent = this.userData.isFollowing ? 'Following' : 'Follow';
      button.classList.toggle('following', this.userData.isFollowing);
    }

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      window.GTApp?.showToast(
        this.userData.isFollowing ? `Following ${this.userData.username}` : `Unfollowed ${this.userData.username}`,
        { type: 'success' }
      );
    } catch (error) {
      // Rollback
      this.userData.isFollowing = wasFollowing;
      if (button) {
        button.textContent = wasFollowing ? 'Following' : 'Follow';
        button.classList.toggle('following', wasFollowing);
      }

      window.GTApp?.showToast('Action failed. Please try again.', { type: 'error' });
    }
  }

  openMessageModal() {
    window.GTApp?.openModal('message-user', {
      title: `Message ${this.userData?.username}`,
      content: `
        <form class="message-form">
          <div class="form-group">
            <label for="message-subject">Subject</label>
            <input type="text" id="message-subject" required>
          </div>
          <div class="form-group">
            <label for="message-content">Message</label>
            <textarea id="message-content" rows="5" required></textarea>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Send Message</button>
            <button type="button" class="btn btn-secondary" onclick="window.GTApp.closeModal('message-user')">Cancel</button>
          </div>
        </form>
      `,
      size: 'medium'
    });
  }

  async blockUser() {
    const confirmed = await this.confirm(`Block ${this.userData?.username}?`,
      'You will no longer see posts or comments from this user.');

    if (!confirmed) return;

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      this.userData.isBlocked = true;
      window.GTApp?.showToast(`Blocked ${this.userData.username}`, { type: 'success' });

      // Redirect to home
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error) {
      window.GTApp?.showToast('Failed to block user', { type: 'error' });
    }
  }

  reportUser() {
    window.GTApp?.openModal('report-user', {
      title: 'Report User',
      content: `
        <form class="report-form">
          <div class="form-group">
            <label>Reason for reporting</label>
            <select required>
              <option value="">Select a reason...</option>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="impersonation">Impersonation</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Additional details</label>
            <textarea rows="4" placeholder="Provide more information..."></textarea>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-danger">Submit Report</button>
            <button type="button" class="btn btn-secondary" onclick="window.GTApp.closeModal('report-user')">Cancel</button>
          </div>
        </form>
      `,
      size: 'small'
    });
  }

  // ===============================================================================
  // CONTENT MANAGEMENT
  // ===============================================================================

  async deleteItem(itemId, itemType) {
    const confirmed = await this.confirm(`Delete this ${itemType}?`,
      'This action cannot be undone.');

    if (!confirmed) return;

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Remove from DOM
      const element = document.querySelector(`[data-item-id="${itemId}"]`);
      element?.remove();

      window.GTApp?.showToast(`${itemType} deleted`, { type: 'success' });
    } catch (error) {
      window.GTApp?.showToast(`Failed to delete ${itemType}`, { type: 'error' });
    }
  }

  editItem(itemId, itemType) {
    if (itemType === 'post') {
      window.location.href = `/edit-post/${itemId}`;
    } else {
      // Open inline editor for comments
      window.GTApp?.showToast('Comment editing coming soon', { type: 'info' });
    }
  }

  // ===============================================================================
  // STATS UPDATER
  // ===============================================================================

  startStatsUpdater() {
    // Update stats periodically
    setInterval(() => {
      if (!document.hidden) {
        this.updateStats();
      }
    }, ProfileConfig.statsUpdateInterval);
  }

  async updateStats() {
    try {
      // Mock API call for updated stats
      const newStats = await this.fetchUpdatedStats();

      // Update karma display
      const karmaElement = document.querySelector('.profile-stat .stat-value');
      if (karmaElement && newStats.karma) {
        karmaElement.textContent = window.GTApp?.Utils.formatNumber(newStats.karma);
      }
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  async fetchUpdatedStats() {
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      karma: this.userData?.karma.total + Math.floor(Math.random() * 10)
    };
  }

  // ===============================================================================
  // UTILITIES
  // ===============================================================================

  confirm(title, message) {
    return new Promise(resolve => {
      window.GTApp?.openModal('confirm', {
        title,
        content: `
          <p>${message}</p>
          <div class="modal-actions">
            <button class="btn btn-danger" onclick="window.confirmResult(true)">Confirm</button>
            <button class="btn btn-secondary" onclick="window.confirmResult(false)">Cancel</button>
          </div>
        `,
        size: 'small',
        persistent: true
      });

      window.confirmResult = (result) => {
        window.GTApp?.closeModal('confirm');
        resolve(result);
        delete window.confirmResult;
      };
    });
  }

  showLoadingState() {
    if (!this.profileContainer) return;
    this.profileContainer.innerHTML = `
      <div class="profile-loading">
        <div class="spinner"></div>
        <p>Loading profile...</p>
      </div>
    `;
  }

  showErrorState(message) {
    if (!this.profileContainer) return;
    this.profileContainer.innerHTML = `
      <div class="profile-error">
        <h2>Error</h2>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }

  showTabLoading() {
    if (!this.tabContent) return;

    if (this.currentPage === 1) {
      this.tabContent.innerHTML = `
        <div class="tab-loading">
          <div class="spinner"></div>
          <p>Loading content...</p>
        </div>
      `;
    }
  }

  showTabError(message) {
    if (!this.tabContent) return;
    this.tabContent.innerHTML = `
      <div class="tab-error">
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// ===============================================================================
// INITIALIZATION
// ===============================================================================

// Initialize when DOM is ready
if (document.querySelector('[data-profile-container]')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.profileManager = new ProfileManager();
    });
  } else {
    window.profileManager = new ProfileManager();
  }
}

// Export for ES modules
export { ProfileManager, ProfileConfig };