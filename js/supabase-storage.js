/**
 * Supabase Storage Service
 * Handles file uploads, downloads, and management
 *
 * Security considerations:
 * - File type validation
 * - Size limits enforcement
 * - Secure URL generation with tokens
 * - Image optimization
 */

import { storage, trace, handleSupabaseError } from './supabase-config.js';

/**
 * Storage service configuration
 */
const STORAGE_CONFIG = {
  maxFileSize: {
    avatar: 5 * 1024 * 1024,       // 5MB
    image: 10 * 1024 * 1024,       // 10MB
    document: 20 * 1024 * 1024,    // 20MB
    video: 100 * 1024 * 1024       // 100MB
  },
  allowedTypes: {
    avatar: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    document: ['application/pdf', 'text/plain', 'text/markdown'],
    video: ['video/mp4', 'video/webm', 'video/ogg'],
    code: ['text/plain', 'text/javascript', 'text/python', 'text/html', 'text/css']
  },
  buckets: {
    avatars: 'avatars',
    posts: 'post-images',
    comments: 'comment-images',
    communities: 'community-assets'
  }
};

/**
 * Storage Service Class
 */
class StorageService {
  constructor() {
    this.uploadTasks = new Map();
    this.downloadCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    this.initBuckets();
  }

  /**
   * Initialize storage buckets
   */
  async initBuckets() {
    // Check and create buckets if they don't exist
    for (const [key, bucketName] of Object.entries(STORAGE_CONFIG.buckets)) {
      try {
        const { data: buckets } = await storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === bucketName);

        if (!bucketExists) {
          const { error } = await storage.createBucket(bucketName, {
            public: key === 'avatars' || key === 'communities',
            fileSizeLimit: STORAGE_CONFIG.maxFileSize[key === 'avatars' ? 'avatar' : 'image']
          });

          if (error && !error.message.includes('already exists')) {
            console.error(`Failed to create bucket ${bucketName}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error checking bucket ${bucketName}:`, error);
      }
    }
  }

  /**
   * ============================================
   * UPLOAD OPERATIONS
   * ============================================
   */

  /**
   * Upload user avatar
   */
  async uploadAvatar(userId, file, onProgress) {
    const performanceTrace = trace('upload_avatar');
    performanceTrace.start();

    try {
      // Validate file
      this.validateFile(file, 'avatar');

      // Generate file path
      const timestamp = Date.now();
      const fileName = `${userId}/${timestamp}.${this.getFileExtension(file.name)}`;

      // Process image (resize, compress)
      const processedFile = await this.processImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8
      });

      // Upload file
      const uploadResult = await this.uploadFile(
        STORAGE_CONFIG.buckets.avatars,
        fileName,
        processedFile,
        {
          cacheControl: '3600',
          upsert: true,
          contentType: processedFile.type
        },
        onProgress
      );

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.putAttribute('size', file.size.toString());
      performanceTrace.stop();

      return uploadResult;

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('upload_avatar', error);
    }
  }

  /**
   * Upload image for post
   */
  async uploadPostImage(postId, file, onProgress) {
    const performanceTrace = trace('upload_post_image');
    performanceTrace.start();

    try {
      // Validate file
      this.validateFile(file, 'image');

      // Generate file path
      const timestamp = Date.now();
      const fileName = `${postId}/${timestamp}.${this.getFileExtension(file.name)}`;

      // Process image (optimize for web)
      const processedFile = await this.processImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85
      });

      // Upload file
      const uploadResult = await this.uploadFile(
        STORAGE_CONFIG.buckets.posts,
        fileName,
        processedFile,
        {
          cacheControl: '31536000', // 1 year
          contentType: processedFile.type
        },
        onProgress
      );

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.putAttribute('size', file.size.toString());
      performanceTrace.stop();

      return uploadResult;

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();
      throw this.handleError('upload_post_image', error);
    }
  }

  /**
   * Upload multiple images
   */
  async uploadMultipleImages(targetId, files, targetType = 'post', onProgress) {
    const results = [];
    const totalFiles = files.length;
    let completedFiles = 0;

    for (const file of files) {
      try {
        const uploadMethod = targetType === 'post'
          ? this.uploadPostImage.bind(this)
          : this.uploadCommentImage.bind(this);

        const result = await uploadMethod(targetId, file, (progress) => {
          const overallProgress = ((completedFiles + progress / 100) / totalFiles) * 100;
          if (onProgress) onProgress(overallProgress);
        });

        results.push(result);
        completedFiles++;

      } catch (error) {
        console.error(`Failed to upload file ${file.name}:`, error);
        results.push({
          error: true,
          fileName: file.name,
          message: error.message
        });
      }
    }

    return results;
  }

  /**
   * Upload comment attachment
   */
  async uploadCommentImage(commentId, file, onProgress) {
    try {
      // Validate file
      this.validateFile(file, 'image');

      // Generate file path
      const timestamp = Date.now();
      const fileName = `${commentId}/${timestamp}.${this.getFileExtension(file.name)}`;

      // Process image
      const processedFile = await this.processImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8
      });

      // Upload file
      return await this.uploadFile(
        STORAGE_CONFIG.buckets.comments,
        fileName,
        processedFile,
        {
          cacheControl: '31536000',
          contentType: processedFile.type
        },
        onProgress
      );

    } catch (error) {
      throw this.handleError('upload_comment_image', error);
    }
  }

  /**
   * Upload community banner/icon
   */
  async uploadCommunityAsset(communityId, file, assetType = 'banner', onProgress) {
    try {
      // Validate file
      this.validateFile(file, 'image');

      // Different dimensions for banner vs icon
      const dimensions = assetType === 'banner'
        ? { maxWidth: 1920, maxHeight: 384 }
        : { maxWidth: 256, maxHeight: 256 };

      // Generate file path
      const timestamp = Date.now();
      const fileName = `${communityId}/${assetType}_${timestamp}.${this.getFileExtension(file.name)}`;

      // Process image
      const processedFile = await this.processImage(file, {
        ...dimensions,
        quality: 0.85
      });

      // Upload file
      return await this.uploadFile(
        STORAGE_CONFIG.buckets.communities,
        fileName,
        processedFile,
        {
          cacheControl: '31536000',
          contentType: processedFile.type
        },
        onProgress
      );

    } catch (error) {
      throw this.handleError('upload_community_asset', error);
    }
  }

  /**
   * Core upload function with progress tracking
   */
  async uploadFile(bucket, path, file, options = {}, onProgress) {
    const uploadTaskId = `upload_${Date.now()}`;

    try {
      // Track upload progress manually since Supabase doesn't have built-in progress
      if (onProgress) onProgress(0);

      const { data, error } = await storage
        .from(bucket)
        .upload(path, file, options);

      if (error) throw error;

      if (onProgress) onProgress(100);

      // Get public URL
      const { data: { publicUrl } } = storage
        .from(bucket)
        .getPublicUrl(path);

      return {
        url: publicUrl,
        path: `${bucket}/${path}`,
        name: file.name,
        size: file.size,
        type: file.type,
        created: new Date().toISOString()
      };

    } catch (error) {
      throw this.handleStorageError(error);
    }
  }

  /**
   * ============================================
   * DELETE OPERATIONS
   * ============================================
   */

  /**
   * Delete file from storage
   */
  async deleteFile(bucket, filePath) {
    const performanceTrace = trace('delete_file');
    performanceTrace.start();

    try {
      const { error } = await storage
        .from(bucket)
        .remove([filePath]);

      if (error) throw error;

      // Clear from cache
      this.clearCacheForPath(`${bucket}/${filePath}`);

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { success: true, path: filePath };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();

      // If file doesn't exist, consider it a success
      if (error.message?.includes('not found')) {
        return { success: true, path: filePath, notFound: true };
      }

      throw this.handleError('delete_file', error);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMultipleFiles(bucket, filePaths) {
    const results = [];

    try {
      const { error } = await storage
        .from(bucket)
        .remove(filePaths);

      if (error) throw error;

      filePaths.forEach(path => {
        this.clearCacheForPath(`${bucket}/${path}`);
        results.push({ success: true, path });
      });

    } catch (error) {
      filePaths.forEach(path => {
        results.push({
          success: false,
          path,
          error: error.message
        });
      });
    }

    return results;
  }

  /**
   * Delete all files in a directory
   */
  async deleteDirectory(bucket, directoryPath) {
    try {
      const { data: files, error: listError } = await storage
        .from(bucket)
        .list(directoryPath);

      if (listError) throw listError;

      if (!files || files.length === 0) {
        return {
          success: true,
          filesDeleted: 0
        };
      }

      const filePaths = files.map(file => `${directoryPath}/${file.name}`);

      const { error: deleteError } = await storage
        .from(bucket)
        .remove(filePaths);

      if (deleteError) throw deleteError;

      return {
        success: true,
        filesDeleted: filePaths.length
      };

    } catch (error) {
      throw this.handleError('delete_directory', error);
    }
  }

  /**
   * ============================================
   * DOWNLOAD OPERATIONS
   * ============================================
   */

  /**
   * Get download URL for a file
   */
  async getFileUrl(bucket, filePath, useCache = true) {
    const cacheKey = `${bucket}/${filePath}`;

    // Check cache
    if (useCache && this.downloadCache.has(cacheKey)) {
      const cached = this.downloadCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.url;
      }
    }

    try {
      const { data: { publicUrl } } = storage
        .from(bucket)
        .getPublicUrl(filePath);

      // Cache the URL
      this.downloadCache.set(cacheKey, {
        url: publicUrl,
        timestamp: Date.now()
      });

      return publicUrl;

    } catch (error) {
      throw this.handleError('get_file_url', error);
    }
  }

  /**
   * Get signed URL for private file
   */
  async getSignedUrl(bucket, filePath, expiresIn = 3600) {
    try {
      const { data, error } = await storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);

      if (error) throw error;

      return data.signedUrl;

    } catch (error) {
      throw this.handleError('get_signed_url', error);
    }
  }

  /**
   * Download file as blob
   */
  async downloadFile(bucket, filePath) {
    try {
      const { data, error } = await storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      return {
        data,
        metadata: {
          name: filePath.split('/').pop(),
          size: data.size,
          type: data.type
        }
      };

    } catch (error) {
      throw this.handleError('download_file', error);
    }
  }

  /**
   * ============================================
   * LIST OPERATIONS
   * ============================================
   */

  /**
   * List files in a directory
   */
  async listFiles(bucket, directoryPath, options = {}) {
    const { limit = 100, offset = 0, sortBy = 'name' } = options;

    try {
      const { data, error } = await storage
        .from(bucket)
        .list(directoryPath, {
          limit,
          offset,
          sortBy: {
            column: sortBy,
            order: 'asc'
          }
        });

      if (error) throw error;

      const files = await Promise.all(
        (data || []).map(async (file) => {
          const fullPath = directoryPath ? `${directoryPath}/${file.name}` : file.name;
          const { data: { publicUrl } } = storage
            .from(bucket)
            .getPublicUrl(fullPath);

          return {
            name: file.name,
            path: fullPath,
            size: file.metadata?.size,
            type: file.metadata?.mimetype,
            created: file.created_at,
            updated: file.updated_at,
            url: publicUrl
          };
        })
      );

      return {
        files,
        hasMore: files.length === limit
      };

    } catch (error) {
      throw this.handleError('list_files', error);
    }
  }

  /**
   * Get storage usage for a user
   */
  async getUserStorageUsage(userId) {
    try {
      const buckets = [
        { name: STORAGE_CONFIG.buckets.avatars, path: userId },
        { name: STORAGE_CONFIG.buckets.posts, path: userId },
        { name: STORAGE_CONFIG.buckets.comments, path: userId }
      ];

      let totalSize = 0;
      const breakdown = {};

      for (const { name, path } of buckets) {
        try {
          const { data } = await storage
            .from(name)
            .list(path);

          let bucketSize = 0;
          if (data) {
            data.forEach(file => {
              bucketSize += file.metadata?.size || 0;
            });
          }

          breakdown[name] = bucketSize;
          totalSize += bucketSize;

        } catch (error) {
          // Directory doesn't exist, skip
          breakdown[name] = 0;
        }
      }

      return {
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        breakdown,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw this.handleError('get_user_storage_usage', error);
    }
  }

  /**
   * ============================================
   * UTILITY FUNCTIONS
   * ============================================
   */

  /**
   * Validate file before upload
   */
  validateFile(file, type) {
    // Check file size
    const maxSize = STORAGE_CONFIG.maxFileSize[type];
    if (file.size > maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
    }

    // Check file type
    const allowedTypes = STORAGE_CONFIG.allowedTypes[type];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Additional validation for images
    if (type === 'avatar' || type === 'image') {
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }
    }

    return true;
  }

  /**
   * Process image (resize, compress)
   */
  async processImage(file, options = {}) {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 0.85
    } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // Calculate new dimensions
          let { width, height } = this.calculateDimensions(
            img.width,
            img.height,
            maxWidth,
            maxHeight
          );

          canvas.width = width;
          canvas.height = height;

          // Draw resized image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              // Create new file with same name
              const processedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });

              resolve(processedFile);
            },
            'image/jpeg',
            quality
          );
        };

        img.onerror = reject;
        img.src = e.target.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Calculate dimensions maintaining aspect ratio
   */
  calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }

    const aspectRatio = originalWidth / originalHeight;

    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename) {
    const parts = filename.split('.');
    return parts[parts.length - 1].toLowerCase();
  }

  /**
   * Generate unique filename
   */
  generateUniqueFilename(originalName, prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = this.getFileExtension(originalName);

    return prefix
      ? `${prefix}_${timestamp}_${random}.${extension}`
      : `${timestamp}_${random}.${extension}`;
  }

  /**
   * Clear cache for a specific path
   */
  clearCacheForPath(path) {
    this.downloadCache.delete(path);
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.downloadCache.clear();
  }

  /**
   * Handle storage errors
   */
  handleStorageError(error) {
    const errorMessages = {
      'Bucket not found': 'Storage bucket not found',
      'Object not found': 'File not found',
      'Unauthorized': 'You do not have permission to access this file',
      'Payload too large': 'File size exceeds maximum allowed',
      'Invalid file type': 'This file type is not allowed'
    };

    const message = Object.keys(errorMessages).find(key =>
      error.message?.includes(key)
    );

    return {
      code: error.code || 'storage_error',
      message: message ? errorMessages[message] : error.message,
      details: error
    };
  }

  /**
   * Handle general errors
   */
  handleError(operation, error) {
    console.error(`Storage error in ${operation}:`, error);
    return handleSupabaseError(error);
  }
}

// Export singleton instance
const storageService = new StorageService();

// Export individual functions for convenience
export const {
  uploadAvatar,
  uploadPostImage,
  uploadMultipleImages,
  uploadCommentImage,
  uploadCommunityAsset,
  deleteFile,
  deleteMultipleFiles,
  deleteDirectory,
  getFileUrl,
  getSignedUrl,
  downloadFile,
  listFiles,
  getUserStorageUsage,
  clearCache
} = storageService;

// Export the service instance
export default storageService;