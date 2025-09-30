/**
 * ===============================================================================
 * POST.JS - Individual Post Page Logic
 * GA Tech AI & Vibe-Coding Community Platform
 * Version: 1.0.0 - ES2025 Modern JavaScript
 * ===============================================================================
 */

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import hljs from 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/highlight.min.js';

// ===============================================================================
// POST PAGE CONFIGURATION
// ===============================================================================

const PostConfig = {
  maxCommentDepth: 5,
  commentsPerPage: 50,
  commentCharLimit: 10000,
  editTimeLimit: 300000, // 5 minutes
  autoSaveInterval: 30000, // 30 seconds
  markdownOptions: {
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false,
    sanitize: false
  }
};

// ===============================================================================
// POST PAGE MANAGER
// ===============================================================================

class PostPageManager {
  constructor() {
    this.postId = this.getPostIdFromUrl();
    this.postData = null;
    this.comments = new Map();
    this.commentTree = [];
    this.sortOrder = 'best';
    this.isLoading = false;
    this.replyBoxes = new Map();
    this.editingComments = new Set();
    this.collapsedThreads = new Set();
    this.init();
  }

  init() {
    this.setupElements();
    this.setupEventListeners();
    this.configureMarkdown();
    this.loadPost();
    this.loadComments();
    this.setupAutoSave();
  }

  getPostIdFromUrl() {
    const pathParts = window.location.pathname.split('/');
    const postIndex = pathParts.indexOf('post');
    return postIndex !== -1 ? pathParts[postIndex + 1] : null;
  }

  setupElements() {
    this.postContainer = document.querySelector('[data-post-container]');
    this.commentsContainer = document.querySelector('[data-comments-container]');
    this.commentForm = document.querySelector('[data-comment-form]');
    this.commentTextarea = document.querySelector('[data-comment-textarea]');
    this.sortSelector = document.querySelector('[data-comment-sort]');
    this.loadMoreButton = document.querySelector('[data-load-more-comments]');
  }

  setupEventListeners() {
    // Comment submission
    this.commentForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitComment();
    });

    // Sort change
    this.sortSelector?.addEventListener('change', (e) => {
      this.changeSortOrder(e.target.value);
    });

    // Delegated event handlers for dynamic content
    document.addEventListener('click', (e) => {
      // Reply button
      if (e.target.closest('[data-reply-button]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.showReplyBox(commentId);
      }

      // Edit button
      if (e.target.closest('[data-edit-comment]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.editComment(commentId);
      }

      // Delete button
      if (e.target.closest('[data-delete-comment]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.deleteComment(commentId);
      }

      // Collapse thread
      if (e.target.closest('[data-collapse-thread]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.toggleThreadCollapse(commentId);
      }

      // Vote buttons
      if (e.target.closest('[data-comment-vote-up]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.voteComment(commentId, 1);
      }

      if (e.target.closest('[data-comment-vote-down]')) {
        const commentId = e.target.closest('[data-comment-id]')?.dataset.commentId;
        if (commentId) this.voteComment(commentId, -1);
      }

      // Cancel reply
      if (e.target.closest('[data-cancel-reply]')) {
        const commentId = e.target.closest('[data-reply-box]')?.dataset.parentId;
        if (commentId) this.hideReplyBox(commentId);
      }

      // Submit reply
      if (e.target.closest('[data-submit-reply]')) {
        const replyBox = e.target.closest('[data-reply-box]');
        if (replyBox) this.submitReply(replyBox.dataset.parentId);
      }
    });

    // Markdown preview toggle
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-preview-toggle]')) {
        const container = e.target.closest('.comment-input-container');
        this.toggleMarkdownPreview(container);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const activeTextarea = document.activeElement;
        if (activeTextarea?.tagName === 'TEXTAREA') {
          const form = activeTextarea.closest('form');
          form?.dispatchEvent(new Event('submit'));
        }
      }

      // Escape to cancel reply/edit
      if (e.key === 'Escape') {
        const activeReplyBox = document.activeElement?.closest('[data-reply-box]');
        if (activeReplyBox) {
          this.hideReplyBox(activeReplyBox.dataset.parentId);
        }
      }
    });

    // Load more comments
    this.loadMoreButton?.addEventListener('click', () => {
      this.loadMoreComments();
    });
  }

  configureMarkdown() {
    // Configure marked.js
    marked.setOptions({
      ...PostConfig.markdownOptions,
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      }
    });

    // Add custom renderer for mentions and subreddit links
    const renderer = new marked.Renderer();

    renderer.link = (href, title, text) => {
      // Handle user mentions
      if (text.startsWith('u/')) {
        return `<a href="/u/${text.substring(2)}" class="user-mention">${text}</a>`;
      }
      // Handle subreddit links
      if (text.startsWith('r/')) {
        return `<a href="/c/${text.substring(2)}" class="subreddit-link">${text}</a>`;
      }
      // Default link rendering
      return `<a href="${href}" ${title ? `title="${title}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    marked.use({ renderer });
  }

  // ===============================================================================
  // POST LOADING
  // ===============================================================================

  async loadPost() {
    if (!this.postId) return;

    try {
      // Mock data - will be replaced with Firebase
      this.postData = await this.fetchPost(this.postId);
      this.renderPost();
    } catch (error) {
      console.error('Error loading post:', error);
      this.showErrorState('Failed to load post');
    }
  }

  async fetchPost(postId) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock post data
    return {
      id: postId,
      title: 'Building a Real-Time Collaborative Code Editor with WebRTC',
      content: `
# Introduction

I've been working on a real-time collaborative code editor using WebRTC and wanted to share my experience and the challenges I faced.

## Tech Stack

- **Frontend**: React with Monaco Editor
- **Backend**: Node.js with Socket.io
- **P2P Communication**: WebRTC with SimplePeer
- **Database**: PostgreSQL with Redis for sessions

## Key Features

1. Real-time cursor tracking
2. Conflict-free replicated data types (CRDTs)
3. Voice chat integration
4. Syntax highlighting for 50+ languages

\`\`\`javascript
// WebRTC connection setup
const peer = new SimplePeer({
  initiator: true,
  trickle: false,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com' }
    ]
  }
});

peer.on('signal', data => {
  socket.emit('signal', { to: partnerId, signal: data });
});
\`\`\`

## Challenges Faced

### 1. Handling Network Latency

The biggest challenge was dealing with network latency and ensuring smooth real-time updates...

### 2. Conflict Resolution

When multiple users edit the same line simultaneously, we needed a robust conflict resolution strategy...

## Demo

You can try the live demo at [https://collab-editor.demo.com](https://collab-editor.demo.com)

## Conclusion

Building this was an incredible learning experience. Happy to answer any questions!
      `,
      author: {
        id: 'user-123',
        username: 'tech_wizard',
        avatar: 'https://i.pravatar.cc/150?img=3',
        karma: 5432,
        verified: true
      },
      community: {
        id: 'webdev',
        name: 'Web Development'
      },
      score: 342,
      comments: 47,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      edited_at: null,
      tags: ['project', 'webrtc', 'javascript'],
      type: 'text',
      userVote: 0,
      saved: false,
      awards: [
        { type: 'gold', count: 1 },
        { type: 'silver', count: 2 }
      ]
    };
  }

  renderPost() {
    if (!this.postContainer || !this.postData) return;

    const timeAgo = window.GTApp?.Utils.timeAgo(this.postData.created_at) || this.postData.created_at;
    const formattedScore = window.GTApp?.Utils.formatNumber(this.postData.score) || this.postData.score;

    const postHTML = `
      <article class="post-full" data-post-id="${this.postData.id}">
        <div class="post-header">
          <div class="post-meta">
            <a href="/c/${this.postData.community.id}" class="post-community">
              r/${this.postData.community.name}
            </a>
            <span class="separator">•</span>
            <span class="post-author">
              Posted by
              <a href="/u/${this.postData.author.username}" class="author-link">
                u/${this.postData.author.username}
                ${this.postData.author.verified ? '<span class="verified-badge" title="Verified GT Student">✓</span>' : ''}
              </a>
            </span>
            <span class="separator">•</span>
            <time class="post-time" datetime="${this.postData.created_at}">${timeAgo}</time>
            ${this.postData.edited_at ? `
              <span class="separator">•</span>
              <span class="edited-indicator" title="Edited ${window.GTApp?.Utils.timeAgo(this.postData.edited_at)}">
                (edited)
              </span>
            ` : ''}
          </div>

          ${this.postData.awards && this.postData.awards.length > 0 ? `
            <div class="post-awards">
              ${this.postData.awards.map(award => `
                <span class="award award-${award.type}" title="${award.type} award">
                  ${this.getAwardIcon(award.type)} ${award.count > 1 ? `x${award.count}` : ''}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <h1 class="post-title">${this.postData.title}</h1>

        ${this.postData.tags.length > 0 ? `
          <div class="post-tags">
            ${this.postData.tags.map(tag => `
              <span class="tag">${tag}</span>
            `).join('')}
          </div>
        ` : ''}

        <div class="post-content markdown-body">
          ${marked.parse(this.postData.content)}
        </div>

        <div class="post-actions">
          <div class="post-voting">
            <button class="vote-button vote-up ${this.postData.userVote > 0 ? 'voted' : ''}"
                    data-vote-up aria-label="Upvote">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3l7 7h-5v7h-4v-7H3l7-7z"/>
              </svg>
            </button>
            <span class="post-score" data-score="${this.postData.score}">${formattedScore}</span>
            <button class="vote-button vote-down ${this.postData.userVote < 0 ? 'voted' : ''}"
                    data-vote-down aria-label="Downvote">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 17l-7-7h5V3h4v7h5l-7 7z"/>
              </svg>
            </button>
          </div>

          <button class="post-action" data-share-post>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 7l3-3m0 0l-3-3m3 3H8c-2.21 0-4 1.79-4 4v8"/>
            </svg>
            <span>Share</span>
          </button>

          <button class="post-action ${this.postData.saved ? 'saved' : ''}" data-save-post>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="${this.postData.saved ? 'currentColor' : 'none'}"
                 stroke="currentColor" stroke-width="2">
              <path d="M5 4v14l5-3 5 3V4c0-.55-.45-1-1-1H6c-.55 0-1 .45-1 1z"/>
            </svg>
            <span>${this.postData.saved ? 'Saved' : 'Save'}</span>
          </button>

          <button class="post-action" data-award-post>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="10" cy="10" r="7"/>
              <path d="M10 6v8m-4-4h8"/>
            </svg>
            <span>Award</span>
          </button>

          <button class="post-action" data-report-post>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 17l4-4m0 0l10-10M7 13L17 3"/>
            </svg>
            <span>Report</span>
          </button>
        </div>
      </article>
    `;

    this.postContainer.innerHTML = postHTML;

    // Apply syntax highlighting to code blocks
    this.highlightCodeBlocks();
  }

  highlightCodeBlocks() {
    const codeBlocks = this.postContainer?.querySelectorAll('pre code');
    codeBlocks?.forEach(block => {
      hljs.highlightElement(block);
    });
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

  // ===============================================================================
  // COMMENT LOADING & RENDERING
  // ===============================================================================

  async loadComments() {
    if (!this.postId) return;

    this.isLoading = true;
    this.showCommentsLoading();

    try {
      const comments = await this.fetchComments(this.postId);
      this.processComments(comments);
      this.renderComments();
    } catch (error) {
      console.error('Error loading comments:', error);
      this.showCommentsError('Failed to load comments');
    } finally {
      this.isLoading = false;
    }
  }

  async fetchComments(postId) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock comment data
    return [
      {
        id: 'comment-1',
        post_id: postId,
        parent_id: null,
        author: {
          id: 'user-456',
          username: 'code_master',
          avatar: 'https://i.pravatar.cc/150?img=5',
          karma: 2345,
          verified: true
        },
        content: 'This is fantastic! I've been looking for a good example of WebRTC implementation. How did you handle the NAT traversal issues?',
        score: 45,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        edited_at: null,
        userVote: 0,
        depth: 0
      },
      {
        id: 'comment-2',
        post_id: postId,
        parent_id: 'comment-1',
        author: {
          id: 'user-123',
          username: 'tech_wizard',
          avatar: 'https://i.pravatar.cc/150?img=3',
          karma: 5432,
          verified: true,
          isOP: true
        },
        content: `Great question! NAT traversal was definitely one of the trickier parts. I used a combination of STUN and TURN servers.

For STUN, I'm using Google's public server, and for TURN, I set up my own using coturn. Here's the configuration:

\`\`\`javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:my-turn-server.com:3478',
    username: 'username',
    credential: 'password'
  }
];
\`\`\`

The TURN server acts as a relay when direct P2P connection isn't possible.`,
        score: 32,
        created_at: new Date(Date.now() - 1800000).toISOString(),
        edited_at: null,
        userVote: 1,
        depth: 1
      },
      {
        id: 'comment-3',
        post_id: postId,
        parent_id: null,
        author: {
          id: 'user-789',
          username: 'curious_dev',
          avatar: 'https://i.pravatar.cc/150?img=8',
          karma: 567,
          verified: false
        },
        content: 'How does this compare to using something like ShareJS or Yjs for the collaborative editing part?',
        score: 12,
        created_at: new Date(Date.now() - 2700000).toISOString(),
        edited_at: null,
        userVote: 0,
        depth: 0
      },
      {
        id: 'comment-4',
        post_id: postId,
        parent_id: 'comment-2',
        author: {
          id: 'user-456',
          username: 'code_master',
          avatar: 'https://i.pravatar.cc/150?img=5',
          karma: 2345,
          verified: true
        },
        content: 'Thanks for the detailed explanation! Did you run into any issues with firewall configurations?',
        score: 8,
        created_at: new Date(Date.now() - 900000).toISOString(),
        edited_at: null,
        userVote: 0,
        depth: 2
      }
    ];
  }

  processComments(comments) {
    // Clear existing comments
    this.comments.clear();
    this.commentTree = [];

    // Build comment map
    comments.forEach(comment => {
      this.comments.set(comment.id, {
        ...comment,
        children: []
      });
    });

    // Build comment tree
    comments.forEach(comment => {
      if (comment.parent_id) {
        const parent = this.comments.get(comment.parent_id);
        if (parent) {
          parent.children.push(comment.id);
        }
      } else {
        this.commentTree.push(comment.id);
      }
    });

    // Sort comments
    this.sortComments();
  }

  sortComments() {
    const sortFn = this.getSortFunction(this.sortOrder);

    // Sort top-level comments
    this.commentTree.sort((a, b) => {
      const commentA = this.comments.get(a);
      const commentB = this.comments.get(b);
      return sortFn(commentA, commentB);
    });

    // Sort child comments recursively
    this.comments.forEach(comment => {
      if (comment.children.length > 0) {
        comment.children.sort((a, b) => {
          const childA = this.comments.get(a);
          const childB = this.comments.get(b);
          return sortFn(childA, childB);
        });
      }
    });
  }

  getSortFunction(order) {
    switch (order) {
      case 'best':
        return (a, b) => {
          // Best = highest score with time decay
          const scoreA = a.score / Math.pow(this.getHoursSince(a.created_at) + 2, 1.8);
          const scoreB = b.score / Math.pow(this.getHoursSince(b.created_at) + 2, 1.8);
          return scoreB - scoreA;
        };
      case 'top':
        return (a, b) => b.score - a.score;
      case 'new':
        return (a, b) => new Date(b.created_at) - new Date(a.created_at);
      case 'controversial':
        return (a, b) => {
          // Controversial = high activity with mixed votes
          const controversyA = Math.abs(a.score - 0) * (a.score < 0 ? 2 : 1);
          const controversyB = Math.abs(b.score - 0) * (b.score < 0 ? 2 : 1);
          return controversyB - controversyA;
        };
      case 'old':
        return (a, b) => new Date(a.created_at) - new Date(b.created_at);
      default:
        return (a, b) => b.score - a.score;
    }
  }

  getHoursSince(date) {
    return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
  }

  renderComments() {
    if (!this.commentsContainer) return;

    const commentsHTML = `
      <div class="comments-section">
        <div class="comments-header">
          <h2 class="comments-title">
            ${this.postData?.comments || 0} Comments
          </h2>
          <div class="comment-controls">
            <select class="comment-sort" data-comment-sort>
              <option value="best" ${this.sortOrder === 'best' ? 'selected' : ''}>Best</option>
              <option value="top" ${this.sortOrder === 'top' ? 'selected' : ''}>Top</option>
              <option value="new" ${this.sortOrder === 'new' ? 'selected' : ''}>New</option>
              <option value="controversial" ${this.sortOrder === 'controversial' ? 'selected' : ''}>Controversial</option>
              <option value="old" ${this.sortOrder === 'old' ? 'selected' : ''}>Old</option>
            </select>
          </div>
        </div>

        <form class="comment-form" data-comment-form>
          <div class="comment-input-container">
            <textarea
              class="comment-textarea"
              data-comment-textarea
              placeholder="What are your thoughts?"
              rows="4"
            ></textarea>
            <div class="comment-preview" style="display: none;"></div>
            <div class="comment-toolbar">
              <button type="button" class="toolbar-btn" data-preview-toggle title="Toggle preview">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3C4.5 3 1.61 5.55 0.36 8c1.25 2.45 4.14 5 7.64 5s6.39-2.55 7.64-5c-1.25-2.45-4.14-5-7.64-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                </svg>
              </button>
              <span class="char-count">0 / ${PostConfig.commentCharLimit}</span>
            </div>
          </div>
          <div class="comment-actions">
            <button type="submit" class="btn btn-primary" disabled>
              Comment
            </button>
            <button type="button" class="btn btn-secondary" data-cancel-comment>
              Cancel
            </button>
          </div>
        </form>

        <div class="comments-list">
          ${this.commentTree.length > 0 ?
            this.commentTree.map(commentId => this.renderComment(commentId)).join('') :
            '<div class="no-comments">No comments yet. Be the first to share your thoughts!</div>'
          }
        </div>

        ${this.commentTree.length >= PostConfig.commentsPerPage ? `
          <button class="load-more-comments" data-load-more-comments>
            Load more comments
          </button>
        ` : ''}
      </div>
    `;

    this.commentsContainer.innerHTML = commentsHTML;

    // Re-setup form elements after render
    this.commentForm = document.querySelector('[data-comment-form]');
    this.commentTextarea = document.querySelector('[data-comment-textarea]');
    this.sortSelector = document.querySelector('[data-comment-sort]');

    // Setup comment form
    this.setupCommentForm();

    // Apply syntax highlighting to comment code blocks
    this.highlightCommentCode();
  }

  renderComment(commentId, isReply = false) {
    const comment = this.comments.get(commentId);
    if (!comment) return '';

    const timeAgo = window.GTApp?.Utils.timeAgo(comment.created_at) || comment.created_at;
    const isCollapsed = this.collapsedThreads.has(commentId);
    const childCount = this.countChildren(commentId);

    return `
      <div class="comment ${isReply ? 'comment-reply' : ''} ${isCollapsed ? 'collapsed' : ''}"
           data-comment-id="${comment.id}"
           style="${comment.depth > 0 ? `margin-left: ${Math.min(comment.depth * 20, 100)}px` : ''}">

        <div class="comment-thread-line" data-collapse-thread></div>

        <div class="comment-voting">
          <button class="vote-button vote-up ${comment.userVote > 0 ? 'voted' : ''}"
                  data-comment-vote-up aria-label="Upvote">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2l5 5h-3v5H6V7H3l5-5z"/>
            </svg>
          </button>
          <span class="comment-score">${comment.score}</span>
          <button class="vote-button vote-down ${comment.userVote < 0 ? 'voted' : ''}"
                  data-comment-vote-down aria-label="Downvote">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 14l-5-5h3V4h4v5h3l-5 5z"/>
            </svg>
          </button>
        </div>

        <div class="comment-main">
          <div class="comment-header">
            <a href="/u/${comment.author.username}" class="comment-author">
              ${comment.author.username}
              ${comment.author.verified ? '<span class="verified-badge" title="Verified">✓</span>' : ''}
              ${comment.author.isOP ? '<span class="op-badge">OP</span>' : ''}
            </a>
            <span class="comment-meta">
              <span class="comment-score-inline">${comment.score} points</span>
              <span class="separator">•</span>
              <time datetime="${comment.created_at}">${timeAgo}</time>
              ${comment.edited_at ? '<span class="edited">(edited)</span>' : ''}
            </span>
          </div>

          <div class="comment-content ${isCollapsed ? 'collapsed-content' : ''}">
            ${isCollapsed ?
              `<span class="collapsed-message">[+] ${childCount} ${childCount === 1 ? 'child' : 'children'} collapsed</span>` :
              marked.parse(comment.content)
            }
          </div>

          ${!isCollapsed ? `
            <div class="comment-actions">
              <button class="comment-action" data-reply-button>
                Reply
              </button>
              <button class="comment-action" data-share-comment>
                Share
              </button>
              <button class="comment-action" data-save-comment>
                Save
              </button>
              ${this.canEditComment(comment) ? `
                <button class="comment-action" data-edit-comment>
                  Edit
                </button>
              ` : ''}
              ${this.canDeleteComment(comment) ? `
                <button class="comment-action" data-delete-comment>
                  Delete
                </button>
              ` : ''}
              <button class="comment-action" data-report-comment>
                Report
              </button>
            </div>
          ` : ''}

          <div class="reply-box-container"></div>

          ${!isCollapsed && comment.children.length > 0 ? `
            <div class="comment-children">
              ${comment.children.map(childId => this.renderComment(childId, true)).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  countChildren(commentId) {
    const comment = this.comments.get(commentId);
    if (!comment || comment.children.length === 0) return 0;

    let count = comment.children.length;
    comment.children.forEach(childId => {
      count += this.countChildren(childId);
    });

    return count;
  }

  canEditComment(comment) {
    // Check if user is author and within edit time limit
    const currentUserId = 'user-123'; // Mock - will come from auth
    const timeSinceCreation = Date.now() - new Date(comment.created_at).getTime();
    return comment.author.id === currentUserId && timeSinceCreation < PostConfig.editTimeLimit;
  }

  canDeleteComment(comment) {
    // Check if user is author or moderator
    const currentUserId = 'user-123'; // Mock - will come from auth
    const isModerator = false; // Mock - will come from auth
    return comment.author.id === currentUserId || isModerator;
  }

  // ===============================================================================
  // COMMENT SUBMISSION
  // ===============================================================================

  setupCommentForm() {
    if (!this.commentTextarea) return;

    // Character counter
    this.commentTextarea.addEventListener('input', () => {
      const length = this.commentTextarea.value.length;
      const counter = document.querySelector('.char-count');
      if (counter) {
        counter.textContent = `${length} / ${PostConfig.commentCharLimit}`;
        counter.classList.toggle('over-limit', length > PostConfig.commentCharLimit);
      }

      // Enable/disable submit button
      const submitBtn = this.commentForm?.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = length === 0 || length > PostConfig.commentCharLimit;
      }
    });

    // Cancel button
    const cancelBtn = this.commentForm?.querySelector('[data-cancel-comment]');
    cancelBtn?.addEventListener('click', () => {
      this.commentTextarea.value = '';
      this.commentTextarea.dispatchEvent(new Event('input'));
    });
  }

  async submitComment() {
    const content = this.commentTextarea?.value.trim();
    if (!content || content.length > PostConfig.commentCharLimit) return;

    const submitBtn = this.commentForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // Mock API call
      const newComment = await this.postComment(content);

      // Add to comments map
      this.comments.set(newComment.id, { ...newComment, children: [] });

      // Add to tree
      this.commentTree.unshift(newComment.id);

      // Re-render comments
      this.renderComments();

      // Clear form
      if (this.commentTextarea) this.commentTextarea.value = '';

      // Show success message
      window.GTApp?.showToast('Comment posted successfully', { type: 'success' });
    } catch (error) {
      console.error('Failed to post comment:', error);
      window.GTApp?.showToast('Failed to post comment', { type: 'error' });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async postComment(content, parentId = null) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock new comment
    return {
      id: `comment-${Date.now()}`,
      post_id: this.postId,
      parent_id: parentId,
      author: {
        id: 'user-123',
        username: 'current_user',
        avatar: 'https://i.pravatar.cc/150?img=10',
        karma: 100,
        verified: true
      },
      content,
      score: 1,
      created_at: new Date().toISOString(),
      edited_at: null,
      userVote: 1,
      depth: parentId ? (this.comments.get(parentId)?.depth || 0) + 1 : 0
    };
  }

  // ===============================================================================
  // REPLY FUNCTIONALITY
  // ===============================================================================

  showReplyBox(commentId) {
    const comment = this.comments.get(commentId);
    if (!comment || comment.depth >= PostConfig.maxCommentDepth) {
      window.GTApp?.showToast('Maximum comment depth reached', { type: 'warning' });
      return;
    }

    // Hide any existing reply box for this comment
    if (this.replyBoxes.has(commentId)) {
      this.hideReplyBox(commentId);
      return;
    }

    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    const container = commentElement?.querySelector('.reply-box-container');

    if (!container) return;

    const replyBox = document.createElement('div');
    replyBox.className = 'reply-box';
    replyBox.dataset.replyBox = '';
    replyBox.dataset.parentId = commentId;

    replyBox.innerHTML = `
      <div class="reply-input-container">
        <textarea
          class="reply-textarea"
          placeholder="Type your reply..."
          rows="3"
        ></textarea>
        <div class="reply-preview" style="display: none;"></div>
        <div class="reply-actions">
          <button class="btn btn-primary btn-sm" data-submit-reply>Reply</button>
          <button class="btn btn-secondary btn-sm" data-cancel-reply>Cancel</button>
          <button class="btn btn-ghost btn-sm" data-preview-toggle>Preview</button>
        </div>
      </div>
    `;

    container.appendChild(replyBox);
    this.replyBoxes.set(commentId, replyBox);

    // Focus textarea
    const textarea = replyBox.querySelector('textarea');
    textarea?.focus();

    // Add @mention
    const authorUsername = comment.author.username;
    textarea.value = `@${authorUsername} `;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  hideReplyBox(commentId) {
    const replyBox = this.replyBoxes.get(commentId);
    if (replyBox) {
      replyBox.remove();
      this.replyBoxes.delete(commentId);
    }
  }

  async submitReply(parentId) {
    const replyBox = this.replyBoxes.get(parentId);
    if (!replyBox) return;

    const textarea = replyBox.querySelector('textarea');
    const content = textarea?.value.trim();

    if (!content) return;

    const submitBtn = replyBox.querySelector('[data-submit-reply]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // Mock API call
      const newComment = await this.postComment(content, parentId);

      // Add to comments map
      this.comments.set(newComment.id, { ...newComment, children: [] });

      // Add to parent's children
      const parent = this.comments.get(parentId);
      if (parent) {
        parent.children.push(newComment.id);
      }

      // Re-render comments
      this.renderComments();

      // Show success message
      window.GTApp?.showToast('Reply posted successfully', { type: 'success' });
    } catch (error) {
      console.error('Failed to post reply:', error);
      window.GTApp?.showToast('Failed to post reply', { type: 'error' });
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // ===============================================================================
  // COMMENT EDITING
  // ===============================================================================

  editComment(commentId) {
    const comment = this.comments.get(commentId);
    if (!comment || !this.canEditComment(comment)) return;

    if (this.editingComments.has(commentId)) {
      this.cancelEdit(commentId);
      return;
    }

    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    const contentElement = commentElement?.querySelector('.comment-content');

    if (!contentElement) return;

    this.editingComments.add(commentId);

    const originalContent = comment.content;
    const editForm = document.createElement('div');
    editForm.className = 'comment-edit-form';

    editForm.innerHTML = `
      <textarea class="edit-textarea" rows="5">${originalContent}</textarea>
      <div class="edit-actions">
        <button class="btn btn-primary btn-sm" data-save-edit>Save</button>
        <button class="btn btn-secondary btn-sm" data-cancel-edit>Cancel</button>
      </div>
    `;

    contentElement.replaceWith(editForm);

    // Event handlers
    const textarea = editForm.querySelector('textarea');
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);

    editForm.querySelector('[data-save-edit]')?.addEventListener('click', () => {
      this.saveEdit(commentId, textarea.value);
    });

    editForm.querySelector('[data-cancel-edit]')?.addEventListener('click', () => {
      this.cancelEdit(commentId);
    });
  }

  async saveEdit(commentId, newContent) {
    const comment = this.comments.get(commentId);
    if (!comment) return;

    const trimmedContent = newContent.trim();
    if (!trimmedContent || trimmedContent === comment.content) {
      this.cancelEdit(commentId);
      return;
    }

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update comment
      comment.content = trimmedContent;
      comment.edited_at = new Date().toISOString();

      // Re-render comment
      this.renderComments();

      window.GTApp?.showToast('Comment updated', { type: 'success' });
    } catch (error) {
      console.error('Failed to update comment:', error);
      window.GTApp?.showToast('Failed to update comment', { type: 'error' });
    }

    this.editingComments.delete(commentId);
  }

  cancelEdit(commentId) {
    this.editingComments.delete(commentId);
    this.renderComments();
  }

  // ===============================================================================
  // COMMENT DELETION
  // ===============================================================================

  async deleteComment(commentId) {
    const comment = this.comments.get(commentId);
    if (!comment || !this.canDeleteComment(comment)) return;

    const confirmed = await this.confirmDelete();
    if (!confirmed) return;

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mark as deleted (don't actually remove, just update content)
      comment.content = '[deleted]';
      comment.author.username = '[deleted]';
      comment.deleted = true;

      // Re-render
      this.renderComments();

      window.GTApp?.showToast('Comment deleted', { type: 'success' });
    } catch (error) {
      console.error('Failed to delete comment:', error);
      window.GTApp?.showToast('Failed to delete comment', { type: 'error' });
    }
  }

  confirmDelete() {
    return new Promise(resolve => {
      window.GTApp?.openModal('confirm-delete', {
        title: 'Delete Comment',
        content: `
          <p>Are you sure you want to delete this comment?</p>
          <p class="text-muted">This action cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-danger" onclick="window.confirmDeleteResult(true)">Delete</button>
            <button class="btn btn-secondary" onclick="window.confirmDeleteResult(false)">Cancel</button>
          </div>
        `,
        size: 'small'
      });

      window.confirmDeleteResult = (result) => {
        window.GTApp?.closeModal('confirm-delete');
        resolve(result);
        delete window.confirmDeleteResult;
      };
    });
  }

  // ===============================================================================
  // VOTING
  // ===============================================================================

  async voteComment(commentId, value) {
    const comment = this.comments.get(commentId);
    if (!comment) return;

    const previousVote = comment.userVote;
    let newVote = value;
    let scoreDelta = value;

    if (previousVote === value) {
      newVote = 0;
      scoreDelta = -value;
    } else if (previousVote !== 0) {
      scoreDelta = value - previousVote;
    }

    // Optimistic update
    comment.userVote = newVote;
    comment.score += scoreDelta;

    // Update UI
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    const scoreElement = commentElement?.querySelector('.comment-score');
    const upButton = commentElement?.querySelector('[data-comment-vote-up]');
    const downButton = commentElement?.querySelector('[data-comment-vote-down]');

    if (scoreElement) scoreElement.textContent = comment.score;
    upButton?.classList.toggle('voted', newVote > 0);
    downButton?.classList.toggle('voted', newVote < 0);

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      // Rollback
      comment.userVote = previousVote;
      comment.score -= scoreDelta;

      if (scoreElement) scoreElement.textContent = comment.score;
      upButton?.classList.toggle('voted', previousVote > 0);
      downButton?.classList.toggle('voted', previousVote < 0);

      window.GTApp?.showToast('Vote failed', { type: 'error' });
    }
  }

  // ===============================================================================
  // THREAD COLLAPSING
  // ===============================================================================

  toggleThreadCollapse(commentId) {
    if (this.collapsedThreads.has(commentId)) {
      this.collapsedThreads.delete(commentId);
    } else {
      this.collapsedThreads.add(commentId);
    }

    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    commentElement?.classList.toggle('collapsed');

    // Re-render to update collapsed state
    this.renderComments();
  }

  // ===============================================================================
  // UTILITIES
  // ===============================================================================

  changeSortOrder(order) {
    this.sortOrder = order;
    this.sortComments();
    this.renderComments();
  }

  toggleMarkdownPreview(container) {
    const textarea = container?.querySelector('textarea');
    const preview = container?.querySelector('.comment-preview, .reply-preview');

    if (!textarea || !preview) return;

    const isPreviewVisible = preview.style.display !== 'none';

    if (isPreviewVisible) {
      preview.style.display = 'none';
      textarea.style.display = 'block';
    } else {
      preview.innerHTML = marked.parse(textarea.value || '*Nothing to preview*');
      preview.style.display = 'block';
      textarea.style.display = 'none';

      // Highlight code in preview
      preview.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
      });
    }
  }

  highlightCommentCode() {
    const codeBlocks = this.commentsContainer?.querySelectorAll('pre code');
    codeBlocks?.forEach(block => {
      hljs.highlightElement(block);
    });
  }

  setupAutoSave() {
    // Auto-save comment drafts
    setInterval(() => {
      const textarea = this.commentTextarea;
      if (textarea && textarea.value) {
        localStorage.setItem(`comment-draft-${this.postId}`, textarea.value);
      }
    }, PostConfig.autoSaveInterval);

    // Load saved draft
    const savedDraft = localStorage.getItem(`comment-draft-${this.postId}`);
    if (savedDraft && this.commentTextarea) {
      this.commentTextarea.value = savedDraft;
      this.commentTextarea.dispatchEvent(new Event('input'));
    }
  }

  showCommentsLoading() {
    if (!this.commentsContainer) return;
    this.commentsContainer.innerHTML = `
      <div class="comments-loading">
        <div class="spinner"></div>
        <p>Loading comments...</p>
      </div>
    `;
  }

  showCommentsError(message) {
    if (!this.commentsContainer) return;
    this.commentsContainer.innerHTML = `
      <div class="comments-error">
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }

  async loadMoreComments() {
    // Mock loading more comments
    window.GTApp?.showToast('Loading more comments...', { type: 'info' });
    // Implementation would fetch next page of comments
  }

  showErrorState(message) {
    if (!this.postContainer) return;
    this.postContainer.innerHTML = `
      <div class="error-state">
        <h2>Error</h2>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Reload</button>
      </div>
    `;
  }
}

// ===============================================================================
// INITIALIZATION
// ===============================================================================

// Initialize when DOM is ready
if (document.querySelector('[data-post-container]')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.postPageManager = new PostPageManager();
    });
  } else {
    window.postPageManager = new PostPageManager();
  }
}

// Export for ES modules
export { PostPageManager, PostConfig };