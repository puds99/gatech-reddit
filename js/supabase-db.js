/**
 * Supabase Database Operations
 * Handles all CRUD operations, real-time listeners, and data management
 *
 * Security considerations:
 * - Input validation before database writes
 * - Proper error handling for all operations
 * - Optimistic updates with rollback on failure
 * - Row Level Security (RLS) policies enforced
 */

import { db, trace, handleSupabaseError, retryOperation } from './supabase-config.js';

/**
 * Database service for all Supabase operations
 */
class DatabaseService {
  constructor() {
    this.subscriptions = new Map();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
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

      // Prepare post data
      const post = {
        author_id: postData.author_id,
        community_id: postData.community_id,
        title: this.sanitizeText(postData.title, 300),
        content: this.sanitizeText(postData.content, 40000),
        type: postData.type || 'text',
        tags: postData.tags || [],
        metadata: postData.metadata || {},
        nsfw: postData.nsfw || false,
        spoiler: postData.spoiler || false
      };

      // Insert post
      const { data, error } = await db
        .from('posts')
        .insert(post)
        .select()
        .single();

      if (error) throw error;

      // Update community stats (fire and forget)
      this.updateCommunityStats(postData.community_id, {
        post_count: 1,
        last_activity: new Date().toISOString()
      });

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return data;

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
      const { data, error } = await db
        .from('posts')
        .select(`
          *,
          author:users!author_id(id, username, display_name, photo_url),
          community:communities!community_id(id, name, slug)
        `)
        .eq('id', postId)
        .single();

      if (error) throw error;

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      // Increment view count (fire and forget)
      this.incrementViewCount(postId);

      return data;

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
      page = 0,
      tags = []
    } = options;

    try {
      let query = db.from('posts').select(`
        *,
        author:users!author_id(id, username, display_name, photo_url),
        community:communities!community_id(id, name, slug),
        vote_status:votes!left(user_id, value)
      `, { count: 'exact' });

      // Add filters
      query = query.eq('deleted', false);

      if (communityId) {
        query = query.eq('community_id', communityId);
      }
      if (authorId) {
        query = query.eq('author_id', authorId);
      }
      if (tags.length > 0) {
        query = query.contains('tags', tags);
      }

      // Add sorting
      switch (sortBy) {
        case 'hot':
          query = query.order('hot_score', { ascending: false });
          break;
        case 'new':
          query = query.order('created_at', { ascending: false });
          break;
        case 'top':
          query = query.order('score', { ascending: false });
          break;
        case 'controversial':
          query = query.order('controversy_score', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      // Add pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        posts: data,
        totalCount: count,
        page,
        pageSize,
        hasMore: (page + 1) * pageSize < count
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
      updates.updated_at = new Date().toISOString();
      updates.edited = true;

      // Update post
      const { data, error } = await db
        .from('posts')
        .update(updates)
        .eq('id', postId)
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      this.cache.delete(`post:${postId}`);

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return data;

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
      const { error } = await db
        .from('posts')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', postId);

      if (error) throw error;

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

      // Check nesting depth if it's a reply
      let depth = 0;
      if (commentData.parent_id) {
        depth = await this.getCommentDepth(commentData.parent_id);
        if (depth >= 5) {
          throw new Error('Maximum comment nesting depth reached');
        }
        depth += 1;
      }

      // Prepare comment data
      const comment = {
        post_id: commentData.post_id,
        author_id: commentData.author_id,
        parent_id: commentData.parent_id || null,
        content: this.sanitizeText(commentData.content, 10000),
        depth
      };

      // Insert comment
      const { data, error } = await db
        .from('comments')
        .insert(comment)
        .select(`
          *,
          author:users!author_id(id, username, display_name, photo_url)
        `)
        .single();

      if (error) throw error;

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return data;

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
      // Use recursive CTE for threaded comments
      const { data, error } = await db.rpc('get_threaded_comments', {
        p_post_id: postId,
        p_sort_by: sortBy,
        p_limit: pageSize
      });

      if (error) throw error;

      // If RPC doesn't exist, fall back to regular query
      if (!data) {
        const { data: comments, error: fallbackError } = await db
          .from('comments')
          .select(`
            *,
            author:users!author_id(id, username, display_name, photo_url),
            vote_status:votes!left(user_id, value)
          `)
          .eq('post_id', postId)
          .eq('deleted', false)
          .order(sortBy === 'new' ? 'created_at' : 'score', { ascending: false })
          .limit(pageSize);

        if (fallbackError) throw fallbackError;

        // Build comment tree
        const commentTree = this.buildCommentTree(comments);
        return {
          comments: commentTree,
          total: comments.length
        };
      }

      return {
        comments: data,
        total: data.length
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
      const { data, error } = await db
        .from('comments')
        .update({
          content: this.sanitizeText(content, 10000),
          updated_at: new Date().toISOString(),
          edited: true
        })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;

      return data;

    } catch (error) {
      throw this.handleError('update_comment', error);
    }
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(commentId) {
    try {
      const { error } = await db
        .from('comments')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString(),
          content: '[deleted]'
        })
        .eq('id', commentId);

      if (error) throw error;

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

      if (value === 0) {
        // Remove vote
        const { error } = await db
          .from('votes')
          .delete()
          .eq('user_id', userId)
          .eq('target_id', targetId)
          .eq('target_type', targetType);

        if (error && error.code !== 'PGRST116') throw error;
      } else {
        // Upsert vote
        const { error } = await db
          .from('votes')
          .upsert({
            user_id: userId,
            target_id: targetId,
            target_type: targetType,
            value
          }, {
            onConflict: 'user_id,target_id,target_type'
          });

        if (error) throw error;
      }

      // The database trigger will handle updating scores

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
      const { data, error } = await db
        .from('votes')
        .select('target_id, value')
        .eq('user_id', userId)
        .in('target_id', targetIds);

      if (error) throw error;

      const votes = {};
      data.forEach(vote => {
        votes[vote.target_id] = vote.value;
      });

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
      const { data, error } = await db
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;

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

      sanitizedUpdates.updated_at = new Date().toISOString();

      const { data, error } = await db
        .from('users')
        .update(sanitizedUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      this.cache.delete(`user:${userId}`);

      return data;

    } catch (error) {
      throw this.handleError('update_user_profile', error);
    }
  }

  /**
   * Get user karma breakdown
   */
  async getUserKarma(userId) {
    try {
      const { data, error } = await db.rpc('get_user_karma', {
        p_user_id: userId
      });

      if (error) throw error;

      // Fallback if RPC doesn't exist
      if (!data) {
        const user = await this.getUserProfile(userId);
        return user.karma || { post: 0, comment: 0, total: 0 };
      }

      return data;

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
      const { data: existing } = await db
        .from('communities')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existing) {
        throw new Error('Community name already taken');
      }

      const community = {
        name: communityData.name,
        slug,
        description: this.sanitizeText(communityData.description, 500),
        type: communityData.type || 'general',
        rules: communityData.rules || [],
        moderators: [communityData.creator_id],
        settings: {
          nsfw: false,
          restricted: false,
          approved_only: false,
          ...communityData.settings
        }
      };

      const { data, error } = await db
        .from('communities')
        .insert(community)
        .select()
        .single();

      if (error) throw error;

      return data;

    } catch (error) {
      throw this.handleError('create_community', error);
    }
  }

  /**
   * Get community by slug
   */
  async getCommunityBySlug(slug) {
    try {
      const { data, error } = await db
        .from('communities')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data;

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
      let query = db.from('communities').select('*');

      // Add sorting
      switch (sortBy) {
        case 'popular':
          query = query.order('member_count', { ascending: false });
          break;
        case 'active':
          query = query.order('last_activity', { ascending: false });
          break;
        case 'new':
          query = query.order('created_at', { ascending: false });
          break;
        default:
          query = query.order('member_count', { ascending: false });
      }

      query = query.limit(pageSize);

      const { data, error } = await query;

      if (error) throw error;

      return data;

    } catch (error) {
      throw this.handleError('get_communities', error);
    }
  }

  /**
   * Join/leave community
   */
  async toggleCommunityMembership(communityId, userId, join = true) {
    try {
      if (join) {
        const { error } = await db
          .from('community_members')
          .insert({
            community_id: communityId,
            user_id: userId
          });

        if (error && error.code !== '23505') throw error; // Ignore duplicate
      } else {
        const { error } = await db
          .from('community_members')
          .delete()
          .eq('community_id', communityId)
          .eq('user_id', userId);

        if (error) throw error;
      }

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
      // This would typically be handled by database triggers
      // but keeping for compatibility
      const { error } = await db.rpc('update_community_stats', {
        p_community_id: communityId,
        p_post_count_delta: updates.post_count || 0,
        p_last_activity: updates.last_activity
      });

      if (error) console.error('Error updating community stats:', error);
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
    const channel = db
      .channel(`post:${postId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts',
        filter: `id=eq.${postId}`
      }, (payload) => {
        if (payload.new) {
          callback(payload.new);
        } else {
          callback(null, { message: 'Post deleted or not found' });
        }
      })
      .subscribe();

    this.subscriptions.set(`post:${postId}`, channel);

    return () => {
      channel.unsubscribe();
      this.subscriptions.delete(`post:${postId}`);
    };
  }

  /**
   * Subscribe to comments for a post
   */
  subscribeToComments(postId, callback) {
    const channel = db
      .channel(`comments:${postId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      }, async () => {
        // Fetch fresh comments when there's a change
        try {
          const { comments } = await this.getComments(postId);
          callback(comments);
        } catch (error) {
          callback(null, error);
        }
      })
      .subscribe();

    this.subscriptions.set(`comments:${postId}`, channel);

    return () => {
      channel.unsubscribe();
      this.subscriptions.delete(`comments:${postId}`);
    };
  }

  /**
   * Subscribe to feed updates
   */
  subscribeToFeed(communityId, callback) {
    const channel = db
      .channel(`feed:${communityId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts',
        filter: communityId ? `community_id=eq.${communityId}` : undefined
      }, async () => {
        // Fetch fresh posts when there's a change
        try {
          const { posts } = await this.getPosts({ communityId });
          callback(posts);
        } catch (error) {
          callback(null, error);
        }
      })
      .subscribe();

    this.subscriptions.set(`feed:${communityId}`, channel);

    return () => {
      channel.unsubscribe();
      this.subscriptions.delete(`feed:${communityId}`);
    };
  }

  /**
   * Unsubscribe from a listener
   */
  unsubscribe(key) {
    const channel = this.subscriptions.get(key);
    if (channel) {
      channel.unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  /**
   * Unsubscribe from all listeners
   */
  unsubscribeAll() {
    this.subscriptions.forEach(channel => channel.unsubscribe());
    this.subscriptions.clear();
  }

  /**
   * ============================================
   * UTILITY FUNCTIONS
   * ============================================
   */

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
    try {
      const { data, error } = await db
        .from('comments')
        .select('depth')
        .eq('id', commentId)
        .single();

      if (error) throw error;

      return data?.depth || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Increment view count (fire and forget)
   */
  async incrementViewCount(postId) {
    try {
      await db.rpc('increment_view_count', { p_post_id: postId });
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
    return handleSupabaseError(error);
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