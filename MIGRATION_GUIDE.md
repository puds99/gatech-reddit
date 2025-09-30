# Firebase to Supabase Migration Guide

## Overview
This guide helps you migrate from Firebase to Supabase for the GA Tech Reddit System.

## Quick Migration Steps

### 1. Update JavaScript Imports

Replace all Firebase imports with Supabase equivalents:

```javascript
// OLD - Firebase
import { auth, db, storage } from './firebase-config.js';
import authService from './firebase-auth.js';
import dbService from './firebase-db.js';
import storageService from './firebase-storage.js';

// NEW - Supabase
import { auth, db, storage } from './supabase-config.js';
import authService from './supabase-auth.js';
import dbService from './supabase-db.js';
import storageService from './supabase-storage.js';
```

### 2. Update HTML Script Tags

In all HTML files, replace Firebase script imports:

```html
<!-- OLD -->
<script src="/js/firebase-config.js" type="module"></script>
<script src="/js/firebase-auth.js" type="module"></script>
<script src="/js/firebase-db.js" type="module"></script>
<script src="/js/firebase-storage.js" type="module"></script>

<!-- NEW -->
<script src="/js/supabase-config.js" type="module"></script>
<script src="/js/supabase-auth.js" type="module"></script>
<script src="/js/supabase-db.js" type="module"></script>
<script src="/js/supabase-storage.js" type="module"></script>
```

### 3. Environment Variables

Create a `.env` file with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Database Setup

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the `database-schema.sql` file to create all tables and functions
4. Configure OAuth providers (GitHub and Google) in Authentication settings

### 5. Storage Setup

Buckets are automatically created on first use, but you can manually create them:

1. Go to Storage in Supabase dashboard
2. Create these buckets:
   - `avatars` (Public)
   - `post-images` (Public)
   - `comment-images` (Public)
   - `community-assets` (Public)

## API Compatibility

The migration maintains the same API surface, so most code should work without changes:

### Authentication
```javascript
// Same API works with both
await authService.signInWithGitHub();
await authService.signInWithGoogle();
await authService.signOut();
authService.onAuthStateChange(callback);
```

### Database Operations
```javascript
// Same API works with both
await dbService.createPost(postData);
await dbService.getPost(postId);
await dbService.vote(targetId, 'post', userId, 1);
dbService.subscribeToComments(postId, callback);
```

### Storage Operations
```javascript
// Same API works with both
await storageService.uploadAvatar(userId, file);
await storageService.uploadPostImage(postId, file);
await storageService.deleteFile(bucket, path);
```

## Key Differences

### 1. Real-time Subscriptions
- Firebase: Uses Firestore onSnapshot
- Supabase: Uses PostgreSQL channels with postgres_changes

### 2. Authentication
- Firebase: Multiple auth providers with Firebase Auth
- Supabase: Built-in OAuth with Supabase Auth

### 3. Database
- Firebase: NoSQL document database
- Supabase: PostgreSQL relational database

### 4. Storage
- Firebase: Cloud Storage with rules
- Supabase: S3-compatible storage with RLS

## Migration Checklist

- [ ] Update all JavaScript imports in `/js/*.js` files
- [ ] Update all script tags in HTML files
- [ ] Set up Supabase project and get credentials
- [ ] Run database schema SQL
- [ ] Configure OAuth providers
- [ ] Test authentication flow
- [ ] Test post creation and retrieval
- [ ] Test commenting system
- [ ] Test voting system
- [ ] Test image uploads
- [ ] Test real-time updates

## Troubleshooting

### Common Issues

1. **Authentication not working**
   - Check OAuth redirect URLs in Supabase dashboard
   - Ensure callback URL is `https://yoursite.com/auth/callback`

2. **Database queries failing**
   - Check Row Level Security (RLS) policies
   - Ensure user is authenticated for write operations

3. **Storage uploads failing**
   - Check bucket permissions (public/private)
   - Verify file size limits

4. **Real-time not updating**
   - Check if Realtime is enabled for the table
   - Verify subscription channel names

## Performance Optimizations

1. **Database Indexes**: All necessary indexes are created in the schema
2. **Caching**: Client-side caching is implemented in service classes
3. **Connection Pooling**: Supabase handles this automatically
4. **Image Optimization**: Images are resized before upload

## Security Notes

1. **Row Level Security (RLS)**: Enabled on all tables
2. **API Keys**: Only use anon key on client, never service key
3. **OAuth Security**: PKCE flow enabled for better security
4. **Input Validation**: All inputs sanitized before database operations

## Support

For issues specific to:
- Supabase: https://supabase.com/docs
- This migration: Create an issue in the project repository