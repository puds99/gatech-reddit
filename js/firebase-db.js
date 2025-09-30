/**
 * Firebase Firestore Database Operations
 * Handles all CRUD operations, real-time listeners, and data management
 *
 * Security considerations:
 * - Input validation before database writes
 * - Proper error handling for all operations
 * - Optimistic updates with rollback on failure
 * - Rate limiting via security rules
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  endAt,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction,
  Timestamp,
  documentId,
  FieldPath
} from 'firebase/firestore';
import { db, trace } from './firebase-config.js';

/**
 * Database service for all Firestore operations
 */
class DatabaseService {
  constructor() {
    this.subscriptions = new Map();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.batchQueue = [];
    this.batchTimer = null;
  }

  /**
   * ============================================
   * POST OPERATIONS
   * ============================================
   */

  /**
   * Create a new post
   */
  async createPost(postData) {
    const performanceTrace = trace('create_post');
    performanceTrace.start();

    try {
      // Validate input
      this.validatePost(postData);

      // Generate post ID
      const postId = this.generateId('post');
      const postRef = doc(db, 'posts', postId);

      // Prepare post document
      const post = {
        id: postId,
        author_id: postData.author_id,
        community_id: postData.community_id,
        title: this.sanitizeText(postData.title, 300),
        content: this.sanitizeText(postData.content, 40000),
        type: postData.type || 'text',
        tags: postData.tags || [],
        metadata: postData.metadata || {},
        score: 0,
        upvotes: 0,
        downvotes: 0,
        comment_count: 0,
        view_count: 0,
        hot_score: 0,
        controversy_score: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        edited: false,
        deleted: false,
        locked: false,
        pinned: false,
        nsfw: postData.nsfw || false,
        spoiler: postData.spoiler || false
      };

      // Create post document
      await setDoc(postRef, post);

      // Update community post count
      await this.updateCommunityStats(postData.community_id, {
        post_count: increment(1),
        last_activity: serverTimestamp()
      });

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { id: postId, ...post };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('create_post', error);
    }
  }

  /**
   * Get a single post by ID
   */
  async getPost(postId) {
    const cacheKey = `post:${postId}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const postDoc = await getDoc(doc(db, 'posts', postId));

      if (!postDoc.exists()) {
        throw new Error('Post not found');
      }

      const postData = { id: postDoc.id, ...postDoc.data() };

      // Cache the result
      this.cache.set(cacheKey, {
        data: postData,
        timestamp: Date.now()
      });

      // Increment view count (fire and forget)
      this.incrementViewCount(postId);

      return postData;

    } catch (error) {
      throw this.handleError('get_post', error);
    }
  }

  /**
   * Get posts with pagination
   */
  async getPosts(options = {}) {
    const {
      communityId = null,
      authorId = null,
      sortBy = 'hot',
      pageSize = 25,
      lastDoc = null,
      tags = []
    } = options;

    try {
      let q = collection(db, 'posts');
      const constraints = [];

      // Add filters
      if (communityId) {
        constraints.push(where('community_id', '==', communityId));
      }
      if (authorId) {
        constraints.push(where('author_id', '==', authorId));
      }
      if (tags.length > 0) {
        constraints.push(where('tags', 'array-contains-any', tags));
      }

      // Add sorting
      constraints.push(where('deleted', '==', false));

      switch (sortBy) {
        case 'hot':
          constraints.push(orderBy('hot_score', 'desc'));
          break;
        case 'new':
          constraints.push(orderBy('created_at', 'desc'));
          break;
        case 'top':
          constraints.push(orderBy('score', 'desc'));
          break;
        case 'controversial':
          constraints.push(orderBy('controversy_score', 'desc'));
          break;
        default:
          constraints.push(orderBy('created_at', 'desc'));
      }

      // Add pagination
      constraints.push(limit(pageSize));

      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      // Execute query
      q = query(q, ...constraints);
      const snapshot = await getDocs(q);

      const posts = [];
      snapshot.forEach(doc => {
        posts.push({ id: doc.id, ...doc.data() });
      });

      return {
        posts,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === pageSize
      };

    } catch (error) {
      throw this.handleError('get_posts', error);
    }
  }

  /**
   * Update a post
   */
  async updatePost(postId, updates) {
    const performanceTrace = trace('update_post');
    performanceTrace.start();

    try {
      // Sanitize updates
      if (updates.title) {
        updates.title = this.sanitizeText(updates.title, 300);
      }
      if (updates.content) {
        updates.content = this.sanitizeText(updates.content, 40000);
      }

      // Add metadata
      updates.updated_at = serverTimestamp();
      updates.edited = true;

      // Update document
      await updateDoc(doc(db, 'posts', postId), updates);

      // Clear cache
      this.cache.delete(`post:${postId}`);

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { success: true, postId };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('update_post', error);
    }
  }

  /**
   * Delete a post (soft delete)
   */
  async deletePost(postId) {
    try {
      await updateDoc(doc(db, 'posts', postId), {
        deleted: true,
        deleted_at: serverTimestamp()
      });

      // Update community stats
      const post = await this.getPost(postId);
      await this.updateCommunityStats(post.community_id, {
        post_count: increment(-1)
      });

      // Clear cache
      this.cache.delete(`post:${postId}`);

      return { success: true };

    } catch (error) {
      throw this.handleError('delete_post', error);
    }
  }

  /**
   * ============================================
   * COMMENT OPERATIONS
   * ============================================
   */

  /**
   * Create a comment
   */
  async createComment(commentData) {
    const performanceTrace = trace('create_comment');
    performanceTrace.start();

    try {
      // Validate input
      this.validateComment(commentData);

      // Check nesting depth
      if (commentData.parent_id) {
        const depth = await this.getCommentDepth(commentData.parent_id);
        if (depth >= 5) {
          throw new Error('Maximum comment nesting depth reached');
        }
        commentData.depth = depth + 1;
      } else {
        commentData.depth = 0;
      }

      // Generate comment ID
      const commentId = this.generateId('comment');
      const commentRef = doc(db, 'comments', commentId);

      // Prepare comment document
      const comment = {
        id: commentId,
        post_id: commentData.post_id,
        author_id: commentData.author_id,
        parent_id: commentData.parent_id || null,
        content: this.sanitizeText(commentData.content, 10000),
        depth: commentData.depth,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        edited: false,
        deleted: false,
        collapsed: false
      };

      // Use transaction to update post comment count
      await runTransaction(db, async (transaction) => {
        transaction.set(commentRef, comment);

        const postRef = doc(db, 'posts', commentData.post_id);
        transaction.update(postRef, {
          comment_count: increment(1),
          last_activity: serverTimestamp()
        });
      });

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { id: commentId, ...comment };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('create_comment', error);
    }
  }

  /**
   * Get comments for a post (with threading)
   */
  async getComments(postId, options = {}) {
    const { sortBy = 'best', pageSize = 50 } = options;

    try {
      // Get all comments for the post
      const q = query(
        collection(db, 'comments'),
        where('post_id', '==', postId),
        where('deleted', '==', false),
        orderBy(sortBy === 'new' ? 'created_at' : 'score', 'desc'),
        limit(pageSize)
      );

      const snapshot = await getDocs(q);
      const comments = [];

      snapshot.forEach(doc => {
        comments.push({ id: doc.id, ...doc.data() });
      });

      // Build comment tree
      const commentTree = this.buildCommentTree(comments);

      return {
        comments: commentTree,
        total: comments.length
      };

    } catch (error) {
      throw this.handleError('get_comments', error);
    }
  }

  /**
   * Update a comment
   */
  async updateComment(commentId, content) {
    try {
      const updates = {
        content: this.sanitizeText(content, 10000),
        updated_at: serverTimestamp(),
        edited: true
      };

      await updateDoc(doc(db, 'comments', commentId), updates);

      return { success: true, commentId };

    } catch (error) {
      throw this.handleError('update_comment', error);
    }
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(commentId) {
    try {
      // Get comment to update post count
      const commentDoc = await getDoc(doc(db, 'comments', commentId));
      const comment = commentDoc.data();

      await runTransaction(db, async (transaction) => {
        // Soft delete comment
        transaction.update(doc(db, 'comments', commentId), {
          deleted: true,
          deleted_at: serverTimestamp(),
          content: '[deleted]'
        });

        // Update post comment count
        const postRef = doc(db, 'posts', comment.post_id);
        transaction.update(postRef, {
          comment_count: increment(-1)
        });
      });

      return { success: true };

    } catch (error) {
      throw this.handleError('delete_comment', error);
    }
  }

  /**
   * ============================================
   * VOTE OPERATIONS
   * ============================================
   */

  /**
   * Vote on a post or comment
   */
  async vote(targetId, targetType, userId, value) {
    const performanceTrace = trace('vote');
    performanceTrace.start();

    try {
      // Validate vote value
      if (value !== 1 && value !== -1 && value !== 0) {
        throw new Error('Invalid vote value');
      }

      const voteId = `${userId}_${targetId}`;
      const voteRef = doc(db, 'votes', voteId);

      // Use transaction for consistency
      await runTransaction(db, async (transaction) => {
        // Get existing vote
        const voteDoc = await transaction.get(voteRef);
        const existingVote = voteDoc.exists() ? voteDoc.data() : null;

        // Calculate score change
        let scoreChange = 0;
        let upvoteChange = 0;
        let downvoteChange = 0;

        if (existingVote) {
          // Remove old vote effect
          if (existingVote.value === 1) {
            upvoteChange = -1;
            scoreChange = -1;
          } else if (existingVote.value === -1) {
            downvoteChange = -1;
            scoreChange = 1;
          }
        }

        // Add new vote effect
        if (value === 1) {
          upvoteChange += 1;
          scoreChange += 1;
        } else if (value === -1) {
          downvoteChange += 1;
          scoreChange -= 1;
        }

        // Update or delete vote
        if (value === 0) {
          // Remove vote
          if (existingVote) {
            transaction.delete(voteRef);
          }
        } else {
          // Create or update vote
          transaction.set(voteRef, {
            user_id: userId,
            target_id: targetId,
            target_type: targetType,
            value: value,
            created_at: serverTimestamp()
          });
        }

        // Update target score
        const targetRef = doc(db, targetType === 'post' ? 'posts' : 'comments', targetId);
        transaction.update(targetRef, {
          score: increment(scoreChange),
          upvotes: increment(upvoteChange),
          downvotes: increment(downvoteChange),
          controversy_score: increment(Math.abs(upvoteChange - downvoteChange))
        });

        // Update user karma
        const authorDoc = await transaction.get(targetRef);
        if (authorDoc.exists()) {
          const authorId = authorDoc.data().author_id;
          const userRef = doc(db, 'users', authorId);
          const karmaField = targetType === 'post' ? 'karma.post' : 'karma.comment';
          transaction.update(userRef, {
            [karmaField]: increment(scoreChange)
          });
        }
      });

      performanceTrace.putAttribute('target_type', targetType);
      performanceTrace.putAttribute('vote_value', value.toString());
      performanceTrace.stop();

      return { success: true, value };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('vote', error);
    }
  }

  /**
   * Get user's votes for multiple targets
   */
  async getUserVotes(userId, targetIds) {
    try {
      const voteIds = targetIds.map(id => `${userId}_${id}`);
      const votes = {};

      // Batch get votes
      const promises = voteIds.map(async (voteId) => {
        const voteDoc = await getDoc(doc(db, 'votes', voteId));
        if (voteDoc.exists()) {
          const targetId = voteId.split('_')[1];
          votes[targetId] = voteDoc.data().value;
        }
      });

      await Promise.all(promises);
      return votes;

    } catch (error) {
      throw this.handleError('get_user_votes', error);
    }
  }

  /**
   * ============================================
   * USER OPERATIONS
   * ============================================
   */

  /**
   * Get user profile
   */
  async getUserProfile(userId) {
    const cacheKey = `user:${userId}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));

      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      const userData = { id: userDoc.id, ...userDoc.data() };

      // Cache the result
      this.cache.set(cacheKey, {
        data: userData,
        timestamp: Date.now()
      });

      return userData;

    } catch (error) {
      throw this.handleError('get_user_profile', error);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId, updates) {
    try {
      // Validate and sanitize updates
      const allowedFields = [
        'username', 'bio', 'avatar', 'preferences',
        'location', 'website', 'github_username'
      ];

      const sanitizedUpdates = {};
      for (const field of allowedFields) {
        if (field in updates) {
          if (typeof updates[field] === 'string') {
            sanitizedUpdates[field] = this.sanitizeText(updates[field], 500);
          } else {
            sanitizedUpdates[field] = updates[field];
          }
        }
      }

      sanitizedUpdates.updated_at = serverTimestamp();

      await updateDoc(doc(db, 'users', userId), sanitizedUpdates);

      // Clear cache
      this.cache.delete(`user:${userId}`);

      return { success: true };

    } catch (error) {
      throw this.handleError('update_user_profile', error);
    }
  }

  /**
   * Get user karma breakdown
   */
  async getUserKarma(userId) {
    try {
      const user = await this.getUserProfile(userId);

      // Get detailed karma from posts and comments
      const [postsSnapshot, commentsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'posts'),
          where('author_id', '==', userId),
          where('deleted', '==', false)
        )),
        getDocs(query(
          collection(db, 'comments'),
          where('author_id', '==', userId),
          where('deleted', '==', false)
        ))
      ]);

      let postKarma = 0;
      let commentKarma = 0;
      let postCount = 0;
      let commentCount = 0;

      postsSnapshot.forEach(doc => {
        const post = doc.data();
        postKarma += post.score || 0;
        postCount++;
      });

      commentsSnapshot.forEach(doc => {
        const comment = doc.data();
        commentKarma += comment.score || 0;
        commentCount++;
      });

      return {
        total: postKarma + commentKarma,
        postKarma,
        commentKarma,
        postCount,
        commentCount,
        averagePostKarma: postCount > 0 ? Math.round(postKarma / postCount) : 0,
        averageCommentKarma: commentCount > 0 ? Math.round(commentKarma / commentCount) : 0
      };

    } catch (error) {
      throw this.handleError('get_user_karma', error);
    }
  }

  /**
   * ============================================
   * COMMUNITY OPERATIONS
   * ============================================
   */

  /**
   * Create a community
   */
  async createCommunity(communityData) {
    try {
      // Validate input
      this.validateCommunity(communityData);

      // Generate slug from name
      const slug = this.generateSlug(communityData.name);

      // Check if slug exists
      const existing = await this.getCommunityBySlug(slug);
      if (existing) {
        throw new Error('Community name already taken');
      }

      const communityId = this.generateId('community');
      const communityRef = doc(db, 'communities', communityId);

      const community = {
        id: communityId,
        name: communityData.name,
        slug: slug,
        description: this.sanitizeText(communityData.description, 500),
        type: communityData.type || 'general',
        rules: communityData.rules || [],
        moderators: [communityData.creator_id],
        member_count: 1,
        post_count: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        settings: {
          nsfw: false,
          restricted: false,
          approved_only: false,
          ...communityData.settings
        }
      };

      await setDoc(communityRef, community);

      return { id: communityId, ...community };

    } catch (error) {
      throw this.handleError('create_community', error);
    }
  }

  /**
   * Get community by slug
   */
  async getCommunityBySlug(slug) {
    try {
      const q = query(
        collection(db, 'communities'),
        where('slug', '==', slug),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };

    } catch (error) {
      throw this.handleError('get_community_by_slug', error);
    }
  }

  /**
   * Get all communities
   */
  async getCommunities(options = {}) {
    const { sortBy = 'popular', pageSize = 20 } = options;

    try {
      const constraints = [];

      // Add sorting
      switch (sortBy) {
        case 'popular':
          constraints.push(orderBy('member_count', 'desc'));
          break;
        case 'active':
          constraints.push(orderBy('last_activity', 'desc'));
          break;
        case 'new':
          constraints.push(orderBy('created_at', 'desc'));
          break;
        default:
          constraints.push(orderBy('member_count', 'desc'));
      }

      constraints.push(limit(pageSize));

      const q = query(collection(db, 'communities'), ...constraints);
      const snapshot = await getDocs(q);

      const communities = [];
      snapshot.forEach(doc => {
        communities.push({ id: doc.id, ...doc.data() });
      });

      return communities;

    } catch (error) {
      throw this.handleError('get_communities', error);
    }
  }

  /**
   * Join/leave community
   */
  async toggleCommunityMembership(communityId, userId, join = true) {
    try {
      await runTransaction(db, async (transaction) => {
        const communityRef = doc(db, 'communities', communityId);
        const userRef = doc(db, 'users', userId);

        transaction.update(communityRef, {
          member_count: increment(join ? 1 : -1)
        });

        transaction.update(userRef, {
          communities: join
            ? arrayUnion(communityId)
            : arrayRemove(communityId)
        });
      });

      return { success: true, joined: join };

    } catch (error) {
      throw this.handleError('toggle_community_membership', error);
    }
  }

  /**
   * Update community stats
   */
  async updateCommunityStats(communityId, updates) {
    try {
      await updateDoc(doc(db, 'communities', communityId), updates);
    } catch (error) {
      console.error('Error updating community stats:', error);
    }
  }

  /**
   * ============================================
   * REAL-TIME LISTENERS
   * ============================================
   */

  /**
   * Subscribe to post updates
   */
  subscribeToPost(postId, callback) {
    const unsubscribe = onSnapshot(
      doc(db, 'posts', postId),
      (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      },
      (error) => {
        console.error('Post subscription error:', error);
        callback(null, error);
      }
    );

    this.subscriptions.set(`post:${postId}`, unsubscribe);
    return unsubscribe;
  }

  /**
   * Subscribe to comments for a post
   */
  subscribeToComments(postId, callback) {
    const q = query(
      collection(db, 'comments'),
      where('post_id', '==', postId),
      where('deleted', '==', false),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const comments = [];
        snapshot.forEach(doc => {
          comments.push({ id: doc.id, ...doc.data() });
        });

        const commentTree = this.buildCommentTree(comments);
        callback(commentTree);
      },
      (error) => {
        console.error('Comments subscription error:', error);
        callback(null, error);
      }
    );

    this.subscriptions.set(`comments:${postId}`, unsubscribe);
    return unsubscribe;
  }

  /**
   * Subscribe to feed updates
   */
  subscribeToFeed(communityId, callback) {
    const q = query(
      collection(db, 'posts'),
      where('community_id', '==', communityId),
      where('deleted', '==', false),
      orderBy('created_at', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => {
          posts.push({ id: doc.id, ...doc.data() });
        });
        callback(posts);
      },
      (error) => {
        console.error('Feed subscription error:', error);
        callback(null, error);
      }
    );

    this.subscriptions.set(`feed:${communityId}`, unsubscribe);
    return unsubscribe;
  }

  /**
   * Unsubscribe from a listener
   */
  unsubscribe(key) {
    const unsubscribe = this.subscriptions.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  /**
   * Unsubscribe from all listeners
   */
  unsubscribeAll() {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }

  /**
   * ============================================
   * UTILITY FUNCTIONS
   * ============================================
   */

  /**
   * Generate unique ID for documents
   */
  generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}${randomStr}` : `${timestamp}${randomStr}`;
  }

  /**
   * Generate URL-friendly slug
   */
  generateSlug(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Sanitize text input
   */
  sanitizeText(text, maxLength = 1000) {
    if (!text) return '';

    // Remove potential XSS
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Trim to max length
    if (text.length > maxLength) {
      text = text.substring(0, maxLength);
    }

    return text.trim();
  }

  /**
   * Build comment tree from flat array
   */
  buildCommentTree(comments) {
    const commentMap = new Map();
    const rootComments = [];

    // First pass: create map
    comments.forEach(comment => {
      comment.children = [];
      commentMap.set(comment.id, comment);
    });

    // Second pass: build tree
    comments.forEach(comment => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.children.push(comment);
        } else {
          rootComments.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    return rootComments;
  }

  /**
   * Get comment depth
   */
  async getCommentDepth(commentId) {
    let depth = 0;
    let currentId = commentId;

    while (currentId && depth < 5) {
      const commentDoc = await getDoc(doc(db, 'comments', currentId));
      if (commentDoc.exists()) {
        const comment = commentDoc.data();
        if (comment.parent_id) {
          depth++;
          currentId = comment.parent_id;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return depth;
  }

  /**
   * Increment view count (fire and forget)
   */
  async incrementViewCount(postId) {
    try {
      await updateDoc(doc(db, 'posts', postId), {
        view_count: increment(1)
      });
    } catch (error) {
      // Silent fail for view counts
      console.debug('View count update failed:', error);
    }
  }

  /**
   * Validate post data
   */
  validatePost(postData) {
    if (!postData.title || postData.title.trim().length < 3) {
      throw new Error('Post title must be at least 3 characters');
    }

    if (!postData.author_id) {
      throw new Error('Author ID is required');
    }

    if (!postData.community_id) {
      throw new Error('Community ID is required');
    }

    if (postData.type === 'text' && !postData.content) {
      throw new Error('Text posts must have content');
    }

    if (postData.type === 'link' && !postData.url) {
      throw new Error('Link posts must have a URL');
    }
  }

  /**
   * Validate comment data
   */
  validateComment(commentData) {
    if (!commentData.content || commentData.content.trim().length < 1) {
      throw new Error('Comment cannot be empty');
    }

    if (!commentData.author_id) {
      throw new Error('Author ID is required');
    }

    if (!commentData.post_id) {
      throw new Error('Post ID is required');
    }
  }

  /**
   * Validate community data
   */
  validateCommunity(communityData) {
    if (!communityData.name || communityData.name.trim().length < 3) {
      throw new Error('Community name must be at least 3 characters');
    }

    if (communityData.name.length > 50) {
      throw new Error('Community name cannot exceed 50 characters');
    }

    if (!communityData.description) {
      throw new Error('Community description is required');
    }

    if (!communityData.creator_id) {
      throw new Error('Creator ID is required');
    }
  }

  /**
   * Handle database errors
   */
  handleError(operation, error) {
    console.error(`Database error in ${operation}:`, error);

    const errorMessages = {
      'permission-denied': 'You do not have permission to perform this action',
      'not-found': 'The requested resource was not found',
      'already-exists': 'This resource already exists',
      'failed-precondition': 'Operation failed due to a precondition',
      'resource-exhausted': 'Too many requests, please try again later',
      'cancelled': 'The operation was cancelled',
      'deadline-exceeded': 'The operation timed out',
      'unavailable': 'The service is currently unavailable',
      'unauthenticated': 'You must be signed in to perform this action'
    };

    return {
      operation,
      code: error.code || 'unknown',
      message: errorMessages[error.code] || error.message || 'An error occurred',
      details: error
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
const dbService = new DatabaseService();

// Export individual functions for convenience
export const {
  createPost,
  getPost,
  getPosts,
  updatePost,
  deletePost,
  createComment,
  getComments,
  updateComment,
  deleteComment,
  vote,
  getUserVotes,
  getUserProfile,
  updateUserProfile,
  getUserKarma,
  createCommunity,
  getCommunityBySlug,
  getCommunities,
  toggleCommunityMembership,
  subscribeToPost,
  subscribeToComments,
  subscribeToFeed,
  unsubscribe,
  unsubscribeAll,
  clearCache
} = dbService;

// Export the service instance
export default dbService;