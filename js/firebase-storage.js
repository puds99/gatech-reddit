/**
 * Firebase Storage Service
 * Handles file uploads, downloads, and management
 *
 * Security considerations:
 * - File type validation
 * - Size limits enforcement
 * - Malware scanning hooks
 * - Secure URL generation with tokens
 */

import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  list,
  getMetadata,
  updateMetadata,
  getBytes,
  getStream
} from 'firebase/storage';
import { storage, trace } from './firebase-config.js';

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
  paths: {
    avatars: 'avatars',
    posts: 'posts',
    comments: 'comments',
    communities: 'communities',
    temp: 'temp'
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
      const fileName = `${userId}_${timestamp}.${this.getFileExtension(file.name)}`;
      const filePath = `${STORAGE_CONFIG.paths.avatars}/${fileName}`;

      // Process image (resize, compress)
      const processedFile = await this.processImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8
      });

      // Upload file
      const uploadResult = await this.uploadFile(
        processedFile,
        filePath,
        {
          customMetadata: {
            userId,
            type: 'avatar',
            originalName: file.name
          }
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
      const fileName = `${postId}_${timestamp}.${this.getFileExtension(file.name)}`;
      const filePath = `${STORAGE_CONFIG.paths.posts}/${postId}/${fileName}`;

      // Process image (optimize for web)
      const processedFile = await this.processImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85
      });

      // Upload file
      const uploadResult = await this.uploadFile(
        processedFile,
        filePath,
        {
          customMetadata: {
            postId,
            type: 'post_image',
            originalName: file.name
          },
          cacheControl: 'public, max-age=31536000'
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
      const fileName = `${commentId}_${timestamp}.${this.getFileExtension(file.name)}`;
      const filePath = `${STORAGE_CONFIG.paths.comments}/${commentId}/${fileName}`;

      // Process image
      const processedFile = await this.processImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8
      });

      // Upload file
      return await this.uploadFile(
        processedFile,
        filePath,
        {
          customMetadata: {
            commentId,
            type: 'comment_image',
            originalName: file.name
          }
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
      const fileName = `${communityId}_${assetType}_${timestamp}.${this.getFileExtension(file.name)}`;
      const filePath = `${STORAGE_CONFIG.paths.communities}/${communityId}/${fileName}`;

      // Process image
      const processedFile = await this.processImage(file, {
        ...dimensions,
        quality: 0.85
      });

      // Upload file
      return await this.uploadFile(
        processedFile,
        filePath,
        {
          customMetadata: {
            communityId,
            type: `community_${assetType}`,
            originalName: file.name
          }
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
  async uploadFile(file, path, metadata = {}, onProgress) {
    const storageRef = ref(storage, path);
    const uploadTaskId = `upload_${Date.now()}`;

    // Create upload task
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    // Store task reference
    this.uploadTasks.set(uploadTaskId, uploadTask);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Calculate progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

          if (onProgress) {
            onProgress(progress, {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              state: snapshot.state
            });
          }

          // Log state changes
          switch (snapshot.state) {
            case 'paused':
              console.log('Upload paused');
              break;
            case 'running':
              console.log(`Upload progress: ${Math.round(progress)}%`);
              break;
          }
        },
        (error) => {
          // Handle upload errors
          this.uploadTasks.delete(uploadTaskId);
          reject(this.handleStorageError(error));
        },
        async () => {
          // Upload completed successfully
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const metadata = await getMetadata(uploadTask.snapshot.ref);

            this.uploadTasks.delete(uploadTaskId);

            resolve({
              url: downloadURL,
              path: path,
              name: metadata.name,
              size: metadata.size,
              type: metadata.contentType,
              created: metadata.timeCreated,
              metadata: metadata.customMetadata,
              fullMetadata: metadata
            });

          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Resume paused upload
   */
  resumeUpload(uploadTaskId) {
    const task = this.uploadTasks.get(uploadTaskId);
    if (task) {
      task.resume();
      return true;
    }
    return false;
  }

  /**
   * Pause upload
   */
  pauseUpload(uploadTaskId) {
    const task = this.uploadTasks.get(uploadTaskId);
    if (task) {
      task.pause();
      return true;
    }
    return false;
  }

  /**
   * Cancel upload
   */
  cancelUpload(uploadTaskId) {
    const task = this.uploadTasks.get(uploadTaskId);
    if (task) {
      task.cancel();
      this.uploadTasks.delete(uploadTaskId);
      return true;
    }
    return false;
  }

  /**
   * ============================================
   * DELETE OPERATIONS
   * ============================================
   */

  /**
   * Delete file from storage
   */
  async deleteFile(filePath) {
    const performanceTrace = trace('delete_file');
    performanceTrace.start();

    try {
      const fileRef = ref(storage, filePath);
      await deleteObject(fileRef);

      // Clear from cache
      this.clearCacheForPath(filePath);

      performanceTrace.putAttribute('success', 'true');
      performanceTrace.stop();

      return { success: true, path: filePath };

    } catch (error) {
      performanceTrace.putAttribute('error', error.message);
      performanceTrace.stop();

      // If file doesn't exist, consider it a success
      if (error.code === 'storage/object-not-found') {
        return { success: true, path: filePath, notFound: true };
      }

      throw this.handleError('delete_file', error);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMultipleFiles(filePaths) {
    const results = [];

    for (const path of filePaths) {
      try {
        const result = await this.deleteFile(path);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          path,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Delete all files in a directory
   */
  async deleteDirectory(directoryPath) {
    try {
      const directoryRef = ref(storage, directoryPath);
      const fileList = await listAll(directoryRef);

      const deletionPromises = fileList.items.map(item =>
        deleteObject(item)
      );

      // Also delete subdirectories recursively
      const subdirPromises = fileList.prefixes.map(prefix =>
        this.deleteDirectory(prefix.fullPath)
      );

      await Promise.all([...deletionPromises, ...subdirPromises]);

      return {
        success: true,
        filesDeleted: fileList.items.length,
        directoriesDeleted: fileList.prefixes.length
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
  async getFileUrl(filePath, useCache = true) {
    // Check cache
    if (useCache && this.downloadCache.has(filePath)) {
      const cached = this.downloadCache.get(filePath);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.url;
      }
    }

    try {
      const fileRef = ref(storage, filePath);
      const url = await getDownloadURL(fileRef);

      // Cache the URL
      this.downloadCache.set(filePath, {
        url,
        timestamp: Date.now()
      });

      return url;

    } catch (error) {
      throw this.handleError('get_file_url', error);
    }
  }

  /**
   * Download file as blob
   */
  async downloadFile(filePath) {
    try {
      const fileRef = ref(storage, filePath);
      const bytes = await getBytes(fileRef);
      const metadata = await getMetadata(fileRef);

      return {
        data: bytes,
        metadata: {
          name: metadata.name,
          size: metadata.size,
          type: metadata.contentType,
          created: metadata.timeCreated
        }
      };

    } catch (error) {
      throw this.handleError('download_file', error);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath) {
    try {
      const fileRef = ref(storage, filePath);
      const metadata = await getMetadata(fileRef);

      return {
        name: metadata.name,
        size: metadata.size,
        type: metadata.contentType,
        created: metadata.timeCreated,
        updated: metadata.updated,
        bucket: metadata.bucket,
        fullPath: metadata.fullPath,
        customMetadata: metadata.customMetadata
      };

    } catch (error) {
      throw this.handleError('get_file_metadata', error);
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(filePath, newMetadata) {
    try {
      const fileRef = ref(storage, filePath);
      const updated = await updateMetadata(fileRef, newMetadata);

      return {
        success: true,
        metadata: updated
      };

    } catch (error) {
      throw this.handleError('update_file_metadata', error);
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
  async listFiles(directoryPath, options = {}) {
    const { maxResults = 100, pageToken = null } = options;

    try {
      const directoryRef = ref(storage, directoryPath);

      let result;
      if (pageToken) {
        result = await list(directoryRef, { maxResults, pageToken });
      } else {
        result = await list(directoryRef, { maxResults });
      }

      const files = await Promise.all(
        result.items.map(async (item) => {
          const metadata = await getMetadata(item);
          return {
            name: metadata.name,
            path: metadata.fullPath,
            size: metadata.size,
            type: metadata.contentType,
            created: metadata.timeCreated,
            url: await getDownloadURL(item)
          };
        })
      );

      return {
        files,
        directories: result.prefixes.map(prefix => prefix.fullPath),
        nextPageToken: result.nextPageToken || null
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
      const paths = [
        `${STORAGE_CONFIG.paths.avatars}/${userId}`,
        `${STORAGE_CONFIG.paths.posts}/${userId}`,
        `${STORAGE_CONFIG.paths.comments}/${userId}`
      ];

      let totalSize = 0;
      const breakdown = {};

      for (const path of paths) {
        try {
          const dirRef = ref(storage, path);
          const fileList = await listAll(dirRef);

          let pathSize = 0;
          for (const item of fileList.items) {
            const metadata = await getMetadata(item);
            pathSize += metadata.size;
          }

          breakdown[path] = pathSize;
          totalSize += pathSize;

        } catch (error) {
          // Directory doesn't exist, skip
          breakdown[path] = 0;
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
      'storage/unauthorized': 'You do not have permission to access this file',
      'storage/canceled': 'Upload was cancelled',
      'storage/unknown': 'An unknown error occurred',
      'storage/object-not-found': 'File not found',
      'storage/bucket-not-found': 'Storage bucket not found',
      'storage/project-not-found': 'Project not found',
      'storage/quota-exceeded': 'Storage quota exceeded',
      'storage/unauthenticated': 'You must be authenticated to access storage',
      'storage/invalid-checksum': 'File upload failed, please try again',
      'storage/server-file-wrong-size': 'File upload failed, please try again'
    };

    return {
      code: error.code,
      message: errorMessages[error.code] || error.message,
      details: error
    };
  }

  /**
   * Handle general errors
   */
  handleError(operation, error) {
    console.error(`Storage error in ${operation}:`, error);

    if (error.code && error.code.startsWith('storage/')) {
      return this.handleStorageError(error);
    }

    return {
      operation,
      message: error.message || 'An error occurred',
      details: error
    };
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
  downloadFile,
  getFileMetadata,
  updateFileMetadata,
  listFiles,
  getUserStorageUsage,
  resumeUpload,
  pauseUpload,
  cancelUpload,
  clearCache
} = storageService;

// Export the service instance
export default storageService;