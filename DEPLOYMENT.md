# GA Tech AI & Vibe-Coding Community Platform
## Complete Deployment & Setup Guide

**Version:** 1.0.0
**Date:** September 2025
**Platform:** Firebase + Progressive Web App (PWA)

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Firebase Project Setup](#firebase-project-setup)
4. [OAuth Configuration](#oauth-configuration)
5. [Production Deployment](#production-deployment)
6. [Post-Deployment](#post-deployment)
7. [Maintenance](#maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

#### 1. Node.js and npm
- **Version:** Node.js 20.x or later (LTS recommended)
- **Download:** https://nodejs.org/
- **Verify Installation:**
```bash
node --version  # Should show v20.x.x or higher
npm --version   # Should show 10.x.x or higher
```

#### 2. Firebase CLI
- **Install Command:**
```bash
npm install -g firebase-tools
```
- **Verify Installation:**
```bash
firebase --version  # Should show 13.0.0 or higher
```

#### 3. Git
- **Download:** https://git-scm.com/
- **Verify Installation:**
```bash
git --version  # Should show 2.40.0 or higher
```

#### 4. Code Editor
- **Recommended:** Visual Studio Code
- **Download:** https://code.visualstudio.com/
- **Recommended Extensions:**
  - Firebase (by toba)
  - Live Server
  - JavaScript (ES6) code snippets
  - Prettier - Code formatter

### Required Accounts

#### 1. Firebase/Google Account
- Sign up at: https://console.firebase.google.com
- You'll need a Google account with billing enabled (free tier available)

#### 2. GitHub Account
- Sign up at: https://github.com
- Required for GitHub OAuth integration

#### 3. Domain Name (Optional)
- For custom domain (e.g., community.gatech.edu)
- Can use default Firebase hosting domain initially

---

## Local Development Setup

### Step 1: Clone or Download the Project

```bash
# Option 1: If you have the project in a Git repository
git clone https://github.com/yourusername/gatech-community.git
cd gatech-community

# Option 2: If you have the files locally
cd C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system
```

### Step 2: Project Structure Verification

Ensure your project structure looks like this:
```
gatech-reddit-system/
│
├── js/                     # JavaScript modules
│   ├── firebase-config.js  # Firebase configuration
│   ├── firebase-auth.js    # Authentication logic
│   ├── firebase-db.js      # Firestore database operations
│   ├── firebase-storage.js # Storage operations
│   ├── main.js            # Main application logic
│   ├── feed.js            # Feed functionality
│   ├── post.js            # Post management
│   ├── profile.js         # User profiles
│   ├── create-post.js     # Post creation
│   └── pwa-install.js     # PWA installation
│
├── styles/                # CSS styles
│   └── main.css          # Main stylesheet
│
├── index.html            # Landing page
├── feed.html             # Main feed page
├── post.html             # Individual post page
├── profile.html          # User profile page
├── create-post.html      # Post creation page
├── offline.html          # Offline fallback page
│
├── manifest.json         # PWA manifest
├── service-worker.js     # Service worker for offline
├── sw-register.js        # Service worker registration
│
├── firebase.json         # Firebase hosting config
├── firestore.rules       # Security rules
└── DEPLOYMENT.md         # This file
```

### Step 3: Environment Variables Setup

Create a `.env` file in your project root:
```bash
# Create .env file
touch .env
```

Add the following content (you'll get actual values from Firebase Console):
```env
# Firebase Configuration
FIREBASE_API_KEY=your-api-key-here
FIREBASE_AUTH_DOMAIN=gatech-community.firebaseapp.com
FIREBASE_PROJECT_ID=gatech-community
FIREBASE_STORAGE_BUCKET=gatech-community.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef123456
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# OAuth Credentials
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# App Settings
APP_ENV=development
APP_URL=http://localhost:5000
```

### Step 4: Install Dependencies

```bash
# Install Firebase tools globally if not already installed
npm install -g firebase-tools

# Initialize npm in your project (if package.json doesn't exist)
npm init -y

# Install local dependencies
npm install --save-dev http-server dotenv webpack webpack-cli
```

### Step 5: Create package.json Scripts

Add these scripts to your `package.json`:
```json
{
  "name": "gatech-community",
  "version": "1.0.0",
  "scripts": {
    "start": "http-server . -p 8080 -c-1",
    "emulators": "firebase emulators:start",
    "emulators:export": "firebase emulators:export ./emulator-data",
    "emulators:import": "firebase emulators:start --import=./emulator-data",
    "deploy": "firebase deploy",
    "deploy:hosting": "firebase deploy --only hosting",
    "deploy:rules": "firebase deploy --only firestore:rules,storage:rules",
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "test": "jest",
    "lint": "eslint js/"
  }
}
```

### Step 6: Running Locally with Firebase Emulators

```bash
# Login to Firebase
firebase login

# Initialize Firebase in your project (if not done)
firebase init

# Start Firebase emulators
npm run emulators

# In a separate terminal, start the local web server
npm start
```

**Access Points:**
- Local Web Server: http://localhost:8080
- Firebase Emulator UI: http://localhost:4000
- Firestore Emulator: http://localhost:8080
- Auth Emulator: http://localhost:9099
- Storage Emulator: http://localhost:9199

---

## Firebase Project Setup

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"** or **"Add project"**
3. Enter project name: `gatech-community`
4. Enable Google Analytics (optional but recommended)
5. Select or create a Google Analytics account
6. Click **"Create project"**

### Step 2: Enable Required Services

#### Authentication
1. In Firebase Console, click **Authentication** in left sidebar
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Enable the following providers:
   - **Email/Password**
     - Click, toggle Enable, Save
   - **Google**
     - Click, toggle Enable
     - Add project support email
     - Configure OAuth consent screen
     - Save
   - **GitHub**
     - Click, toggle Enable
     - Add Client ID and Secret (see OAuth Configuration section)
     - Copy the callback URL for GitHub setup
     - Save

#### Firestore Database
1. Click **Firestore Database** in left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"**
4. Select location: `us-central1` (or closest to your users)
5. Click **"Enable"**

#### Storage
1. Click **Storage** in left sidebar
2. Click **"Get started"**
3. Choose **"Start in production mode"**
4. Select same location as Firestore
5. Click **"Done"**

### Step 3: Get Firebase Configuration

1. Click the gear icon ⚙️ next to **"Project Overview"**
2. Select **"Project settings"**
3. Scroll to **"Your apps"** section
4. Click **"</>"** icon to add a web app
5. Register app:
   - App nickname: `GA Tech Community Web`
   - Check **"Also set up Firebase Hosting"**
   - Click **"Register app"**
6. Copy the Firebase configuration object:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "gatech-community.firebaseapp.com",
  projectId: "gatech-community",
  storageBucket: "gatech-community.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-ABC123"
};
```

7. Update your `js/firebase-config.js` file with these values

### Step 4: Deploy Security Rules

```bash
# Deploy Firestore security rules
firebase deploy --only firestore:rules

# Deploy Storage security rules (create storage.rules file first)
echo 'rules_version = "2";
service firebase.storage {
  match /b/{bucket}/o {
    match /user-avatars/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches("image/.*");
    }

    match /post-media/{postId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 50 * 1024 * 1024;
    }

    match /community-assets/{communityId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}' > storage.rules

firebase deploy --only storage:rules
```

### Step 5: Create Initial Database Structure

Run this in Firebase Console or using Admin SDK:

```javascript
// Initialize collections with sample structure
const initializeDatabase = async () => {
  const db = firebase.firestore();

  // Create communities collection
  await db.collection('communities').doc('ai-research').set({
    name: 'AI Research',
    description: 'Discussions about artificial intelligence and machine learning',
    icon: '🤖',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    member_count: 0,
    moderators: [],
    rules: [
      'Be respectful and constructive',
      'No spam or self-promotion',
      'Stay on topic',
      'Cite sources for claims'
    ]
  });

  await db.collection('communities').doc('vibe-coding').set({
    name: 'Vibe Coding',
    description: 'Collaborative programming and project discussions',
    icon: '💻',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    member_count: 0,
    moderators: [],
    rules: [
      'Share code responsibly',
      'Help others learn',
      'No academic dishonesty',
      'Constructive feedback only'
    ]
  });

  console.log('Database initialized successfully!');
};
```

---

## OAuth Configuration

### GitHub OAuth Setup

1. **Navigate to GitHub Settings:**
   - Go to https://github.com/settings/developers
   - Click **"New OAuth App"** or **"Register a new application"**

2. **Fill in Application Details:**
   ```
   Application name: GA Tech Community Platform
   Homepage URL: https://gatech-community.firebaseapp.com
   Application description: Georgia Tech's community platform for AI and coding
   Authorization callback URL: https://gatech-community.firebaseapp.com/__/auth/handler
   ```

   **For local development, also add:**
   ```
   Authorization callback URL: http://localhost:5000/__/auth/handler
   ```

3. **Get Credentials:**
   - After creation, you'll see:
     - **Client ID:** `abc123def456...`
     - **Client Secret:** Click **"Generate a new client secret"**
   - Save these securely!

4. **Update Firebase:**
   - Go to Firebase Console → Authentication → Sign-in method
   - Click GitHub provider
   - Add Client ID and Client Secret
   - Save

### Google OAuth Setup

1. **Navigate to Google Cloud Console:**
   - Go to https://console.cloud.google.com
   - Select your Firebase project (or create matching one)

2. **Configure OAuth Consent Screen:**
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External** user type
   - Fill in required fields:
     ```
     App name: GA Tech Community
     User support email: your-email@gatech.edu
     App domain: gatech-community.firebaseapp.com
     Developer contact: your-email@gatech.edu
     ```
   - Add scopes: `email`, `profile`, `openid`
   - Add test users if in testing mode

3. **Create OAuth 2.0 Credentials:**
   - Go to **APIs & Services** → **Credentials**
   - Click **"+ CREATE CREDENTIALS"** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `GA Tech Community Web Client`
   - Authorized JavaScript origins:
     ```
     https://gatech-community.firebaseapp.com
     http://localhost:5000
     http://localhost:8080
     ```
   - Authorized redirect URIs:
     ```
     https://gatech-community.firebaseapp.com/__/auth/handler
     http://localhost:5000/__/auth/handler
     ```
   - Click **Create**

4. **Save Credentials:**
   - Copy Client ID and Client Secret
   - These are automatically configured in Firebase for Google Auth

### Update Configuration Files

Update your `js/firebase-config.js`:
```javascript
// OAuth Configuration
const authProviders = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || 'your-github-client-id',
    scope: ['read:user', 'user:email']
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    scope: ['email', 'profile']
  }
};
```

---

## Production Deployment

### Step 1: Build Optimization

Create a build script (`build.js`):
```javascript
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

// Minify JavaScript files
async function minifyJS() {
  const jsDir = path.join(__dirname, 'js');
  const files = fs.readdirSync(jsDir);

  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(jsDir, file);
      const code = fs.readFileSync(filePath, 'utf8');
      const minified = await minify(code);

      fs.writeFileSync(
        path.join(__dirname, 'dist', 'js', file),
        minified.code
      );
    }
  }
}

// Minify CSS
function minifyCSS() {
  const cssPath = path.join(__dirname, 'styles', 'main.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const minified = new CleanCSS().minify(css);

  fs.writeFileSync(
    path.join(__dirname, 'dist', 'styles', 'main.css'),
    minified.styles
  );
}

// Run build
async function build() {
  console.log('Building for production...');
  await minifyJS();
  minifyCSS();
  console.log('Build complete!');
}

build();
```

### Step 2: Pre-deployment Checklist

```bash
# 1. Update environment to production
export NODE_ENV=production

# 2. Run tests (if you have them)
npm test

# 3. Build production files
npm run build

# 4. Validate Firebase configuration
firebase projects:list

# 5. Check which project is active
firebase use gatech-community
```

### Step 3: Deploy to Firebase Hosting

```bash
# Deploy everything (hosting, rules, functions if any)
firebase deploy

# Or deploy specific services
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

**Expected Output:**
```
=== Deploying to 'gatech-community'...

i  deploying storage, firestore, hosting
i  firebase.storage: checking storage.rules for compilation errors...
✔  firebase.storage: rules file storage.rules compiled successfully
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  hosting[gatech-community]: beginning deploy...
i  hosting[gatech-community]: found 25 files in public
✔  hosting[gatech-community]: file upload complete
i  storage: releasing rules storage.rules to firebase.storage...
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore
✔  storage: released rules storage.rules to firebase.storage
i  hosting[gatech-community]: finalizing version...
✔  hosting[gatech-community]: version finalized
i  hosting[gatech-community]: releasing new version...
✔  hosting[gatech-community]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/gatech-community/overview
Hosting URL: https://gatech-community.web.app
```

### Step 4: Custom Domain Setup

#### Option A: Using a Subdomain (e.g., community.gatech.edu)

1. **In Firebase Console:**
   - Go to **Hosting** → **Add custom domain**
   - Enter domain: `community.gatech.edu`
   - Click **Continue**

2. **DNS Configuration:**
   - Firebase will provide DNS records:
     ```
     Type: A
     Host: community
     Value: 151.101.1.195

     Type: A
     Host: community
     Value: 151.101.65.195
     ```

3. **Add to DNS Provider:**
   - Contact GA Tech IT or domain administrator
   - Add the A records provided
   - Wait for propagation (up to 48 hours)

4. **SSL Certificate:**
   - Firebase automatically provisions SSL certificate
   - No action needed once domain is verified

#### Option B: Using Firebase Default Domains

Your app is automatically available at:
- `https://gatech-community.web.app`
- `https://gatech-community.firebaseapp.com`

### Step 5: Performance Optimization

1. **Enable CDN and Caching:**
   - Already configured in `firebase.json`
   - Images cached for 1 year
   - JS/CSS cached for 1 year with immutable flag

2. **Enable Compression:**
   ```json
   // Add to firebase.json hosting section
   "headers": [
     {
       "source": "**/*.@(js|css|html)",
       "headers": [
         {
           "key": "Content-Encoding",
           "value": "gzip"
         }
       ]
     }
   ]
   ```

3. **Optimize Images:**
   ```bash
   # Install image optimization tool
   npm install -g imagemin-cli

   # Optimize all images
   imagemin images/* --out-dir=images/optimized
   ```

---

## Post-Deployment

### Step 1: Testing Checklist

#### Core Functionality Tests
- [ ] **Homepage loads correctly**
  - Navigate to: https://gatech-community.web.app
  - Verify landing page displays

- [ ] **Authentication Flow**
  - Test Google Sign-in
  - Test GitHub Sign-in
  - Test Email/Password registration
  - Test logout functionality

- [ ] **User Features**
  - Create a new post
  - Upload an image
  - Comment on a post
  - Upvote/downvote content
  - Edit profile information

- [ ] **PWA Installation**
  - Check install prompt appears
  - Install app on mobile device
  - Test offline functionality
  - Verify push notifications (if implemented)

#### Performance Tests
```bash
# Use Lighthouse in Chrome DevTools
# Target scores:
# - Performance: > 90
# - Accessibility: > 90
# - Best Practices: > 90
# - SEO: > 90
# - PWA: All checks pass
```

### Step 2: Monitoring Setup

#### Firebase Analytics
1. Go to Firebase Console → Analytics
2. Enable Google Analytics if not already done
3. View real-time user activity
4. Set up custom events:

```javascript
// Track custom events in your app
import { getAnalytics, logEvent } from 'firebase/analytics';

const analytics = getAnalytics();

// Track post creation
logEvent(analytics, 'create_post', {
  community: 'ai-research',
  post_type: 'discussion'
});

// Track engagement
logEvent(analytics, 'engagement', {
  action: 'upvote',
  content_type: 'post'
});
```

#### Firebase Performance Monitoring
1. Enable Performance Monitoring in Firebase Console
2. Add to your app:

```javascript
import { getPerformance } from 'firebase/performance';

const perf = getPerformance();
// Automatically tracks page load, network requests, etc.
```

#### Error Tracking with Firebase Crashlytics
```javascript
// Add error tracking
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // Send to Firebase or other error tracking service
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Send to Firebase or other error tracking service
});
```

### Step 3: Set Up Monitoring Alerts

1. **Firebase Console Alerts:**
   - Go to Firebase Console → Project Settings → Integrations
   - Set up email alerts for:
     - Crash rate increases
     - Performance degradation
     - Quota approaching limits

2. **Uptime Monitoring:**
   - Use Firebase Monitoring or external service
   - Set up StatusPage or similar:
   ```javascript
   // Simple uptime check endpoint
   app.get('/health', (req, res) => {
     res.json({
       status: 'healthy',
       timestamp: new Date().toISOString(),
       version: '1.0.0'
     });
   });
   ```

3. **Budget Alerts:**
   - Go to Google Cloud Console → Billing → Budgets & alerts
   - Create budget with alerts at 50%, 75%, 90%, 100%

### Step 4: User Analytics Dashboard

Create a simple analytics view in your app:
```javascript
// analytics-dashboard.js
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

async function getAnalytics() {
  const db = getFirestore();

  // Get user count
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const userCount = usersSnapshot.size;

  // Get post count
  const postsSnapshot = await getDocs(collection(db, 'posts'));
  const postCount = postsSnapshot.size;

  // Get today's active users
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeUsersQuery = query(
    collection(db, 'user_activity'),
    where('last_seen', '>=', today)
  );
  const activeUsersSnapshot = await getDocs(activeUsersQuery);
  const dailyActiveUsers = activeUsersSnapshot.size;

  return {
    userCount,
    postCount,
    dailyActiveUsers,
    timestamp: new Date().toISOString()
  };
}
```

---

## Maintenance

### Regular Maintenance Tasks

#### Daily Tasks
- [ ] Check error logs in Firebase Console
- [ ] Monitor active user count
- [ ] Review any user-reported issues
- [ ] Check system health dashboard

#### Weekly Tasks
- [ ] Review Firebase usage and costs
- [ ] Check for security alerts
- [ ] Update dependencies if needed:
  ```bash
  npm outdated
  npm update
  ```
- [ ] Backup Firestore data (see backup section)

#### Monthly Tasks
- [ ] Review and optimize database queries
- [ ] Analyze user engagement metrics
- [ ] Update security rules if needed
- [ ] Performance audit with Lighthouse
- [ ] Review and clean up storage files

### Update Procedures

#### Updating Application Code
```bash
# 1. Make changes locally
# 2. Test thoroughly
npm test

# 3. Build production version
npm run build

# 4. Deploy to staging (optional)
firebase hosting:channel:deploy staging

# 5. Test staging URL
# https://gatech-community--staging-randomhash.web.app

# 6. Deploy to production
firebase deploy --only hosting

# 7. Verify deployment
curl -I https://gatech-community.web.app
```

#### Updating Dependencies
```bash
# Check for outdated packages
npm outdated

# Update all dependencies to latest minor versions
npm update

# Update specific package
npm install package-name@latest

# Update Firebase SDK
npm install firebase@latest

# Test after updates
npm test
npm run build
```

#### Updating Security Rules
```bash
# 1. Edit firestore.rules or storage.rules locally

# 2. Test rules with emulator
firebase emulators:start

# 3. Deploy rules
firebase deploy --only firestore:rules
firebase deploy --only storage:rules

# 4. Monitor for any access issues
```

### Backup Strategies

#### Automatic Firestore Backups
```bash
# Set up automatic daily backups using gcloud
gcloud firestore export gs://gatech-community-backups/$(date +%Y%m%d)

# Create a Cloud Scheduler job for automatic backups
gcloud scheduler jobs create app-engine backup-firestore \
  --schedule="0 2 * * *" \
  --time-zone="America/New_York" \
  --location=us-central1 \
  --service=firestore-backup
```

#### Manual Backup Script
Create `backup.js`:
```javascript
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  projectId: 'gatech-community'
});

async function backupCollection(collectionName) {
  const db = admin.firestore();
  const snapshot = await db.collection(collectionName).get();

  const data = [];
  snapshot.forEach(doc => {
    data.push({
      id: doc.id,
      ...doc.data()
    });
  });

  fs.writeFileSync(
    `backup_${collectionName}_${Date.now()}.json`,
    JSON.stringify(data, null, 2)
  );

  console.log(`Backed up ${data.length} documents from ${collectionName}`);
}

// Backup all collections
async function backupAll() {
  await backupCollection('users');
  await backupCollection('posts');
  await backupCollection('comments');
  await backupCollection('communities');
  console.log('Backup complete!');
}

backupAll();
```

### Cost Monitoring and Optimization

#### Monitor Usage
1. Go to Firebase Console → Usage and billing
2. Check daily/monthly usage for:
   - Firestore reads/writes/deletes
   - Storage bandwidth
   - Hosting bandwidth
   - Authentication verifications

#### Cost Optimization Tips

1. **Firestore Optimization:**
   ```javascript
   // Use compound queries instead of multiple reads
   const posts = await db.collection('posts')
     .where('community', '==', 'ai-research')
     .where('created_at', '>', lastWeek)
     .limit(20)
     .get();

   // Cache frequently accessed data
   const cache = new Map();
   function getCachedUser(userId) {
     if (!cache.has(userId)) {
       cache.set(userId, db.collection('users').doc(userId).get());
     }
     return cache.get(userId);
   }
   ```

2. **Storage Optimization:**
   ```javascript
   // Resize images before upload
   function resizeImage(file, maxWidth = 1200) {
     return new Promise((resolve) => {
       const reader = new FileReader();
       reader.onload = (e) => {
         const img = new Image();
         img.onload = () => {
           const canvas = document.createElement('canvas');
           const ctx = canvas.getContext('2d');

           let width = img.width;
           let height = img.height;

           if (width > maxWidth) {
             height = (maxWidth / width) * height;
             width = maxWidth;
           }

           canvas.width = width;
           canvas.height = height;
           ctx.drawImage(img, 0, 0, width, height);

           canvas.toBlob(resolve, 'image/jpeg', 0.85);
         };
         img.src = e.target.result;
       };
       reader.readAsDataURL(file);
     });
   }
   ```

3. **Hosting Optimization:**
   - Enable CDN caching (already in firebase.json)
   - Use lazy loading for images
   - Implement code splitting
   - Minify all assets

### Scaling Considerations

#### When to Scale

Monitor these metrics:
- **Daily Active Users (DAU):** > 10,000
- **Firestore Reads:** > 50,000/day
- **Storage:** > 5GB
- **Bandwidth:** > 10GB/month

#### Scaling Strategies

1. **Database Sharding:**
   ```javascript
   // Shard user data by first letter of username
   function getUserShard(username) {
     const firstLetter = username[0].toLowerCase();
     return `users_${firstLetter}`;
   }

   // Distributed counters for high-write fields
   function incrementCounter(docRef, numShards = 10) {
     const shardId = Math.floor(Math.random() * numShards);
     const shardRef = docRef.collection('shards').doc(shardId.toString());
     return shardRef.update({
       count: firebase.firestore.FieldValue.increment(1)
     });
   }
   ```

2. **Implement Caching Layer:**
   ```javascript
   // Redis or Memcached for frequently accessed data
   const redis = require('redis');
   const client = redis.createClient();

   async function getCachedPost(postId) {
     const cached = await client.get(`post:${postId}`);
     if (cached) return JSON.parse(cached);

     const post = await db.collection('posts').doc(postId).get();
     await client.setex(`post:${postId}`, 3600, JSON.stringify(post.data()));
     return post.data();
   }
   ```

3. **Use Cloud Functions for Heavy Processing:**
   ```javascript
   // functions/index.js
   exports.processImage = functions.storage.object().onFinalize(async (object) => {
     // Resize, optimize, and create thumbnails
     const bucket = admin.storage().bucket();
     const filePath = object.name;
     const fileName = path.basename(filePath);

     // Process image...
     return 'Image processed';
   });
   ```

---

## Troubleshooting

### Common Issues and Solutions

#### Authentication Issues

**Problem:** "This domain is not authorized" error
```
Solution:
1. Go to Firebase Console → Authentication → Settings
2. Add your domain to Authorized domains:
   - localhost
   - gatech-community.web.app
   - gatech-community.firebaseapp.com
   - Your custom domain
```

**Problem:** GitHub OAuth redirect error
```
Solution:
1. Check callback URL in GitHub OAuth app settings
2. Must match exactly: https://gatech-community.firebaseapp.com/__/auth/handler
3. For localhost: http://localhost:5000/__/auth/handler
```

#### Deployment Issues

**Problem:** "Permission denied" during deployment
```bash
# Solution: Re-authenticate
firebase logout
firebase login
firebase use gatech-community
firebase deploy
```

**Problem:** "Quota exceeded" error
```
Solution:
1. Check Firebase Console → Usage and billing
2. Upgrade to Blaze plan if on Spark (free) plan
3. Or wait until next day for quota reset
```

#### Performance Issues

**Problem:** Slow page loads
```javascript
// Solution: Implement lazy loading
const lazyLoadImages = () => {
  const images = document.querySelectorAll('img[data-src]');
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        imageObserver.unobserve(img);
      }
    });
  });

  images.forEach(img => imageObserver.observe(img));
};
```

**Problem:** High Firestore read costs
```javascript
// Solution: Implement pagination and caching
const PAGE_SIZE = 20;
let lastDoc = null;

async function loadMorePosts() {
  let query = db.collection('posts')
    .orderBy('created_at', 'desc')
    .limit(PAGE_SIZE);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snapshot = await query.get();
  lastDoc = snapshot.docs[snapshot.docs.length - 1];

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

#### PWA Issues

**Problem:** Service worker not updating
```javascript
// Solution: Implement update prompt
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            if (confirm('New version available! Update?')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          }
        });
      });
    });
}
```

**Problem:** Install prompt not showing
```javascript
// Solution: Handle beforeinstallprompt event
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent default browser prompt
  e.preventDefault();
  // Store event for later use
  deferredPrompt = e;
  // Show custom install button
  document.getElementById('install-btn').style.display = 'block';
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);
    deferredPrompt = null;
  }
});
```

### Debug Commands

```bash
# Check Firebase CLI version
firebase --version

# List Firebase projects
firebase projects:list

# View current project
firebase use

# Test security rules
firebase emulators:exec --only firestore "npm test"

# View hosting headers
curl -I https://gatech-community.web.app

# Check service worker
curl https://gatech-community.web.app/service-worker.js

# Test offline mode (in Chrome DevTools)
# 1. Open DevTools (F12)
# 2. Go to Network tab
# 3. Check "Offline"
# 4. Refresh page

# Monitor real-time database
firebase database:profile
```

### Getting Help

1. **Firebase Documentation:** https://firebase.google.com/docs
2. **Firebase Support:** https://firebase.google.com/support
3. **Stack Overflow:** Tag with `firebase`, `firestore`, `firebase-hosting`
4. **GitHub Issues:** If using open source version
5. **Community Discord/Slack:** GA Tech developer communities

---

## Security Best Practices

### Checklist

- [ ] Environment variables never committed to Git
- [ ] API keys restricted by domain in Google Cloud Console
- [ ] Firestore rules prevent unauthorized access
- [ ] Storage rules limit file sizes and types
- [ ] CSP headers configured in firebase.json
- [ ] HTTPS enforced (automatic with Firebase Hosting)
- [ ] Input validation on all forms
- [ ] XSS protection in place
- [ ] Rate limiting implemented
- [ ] Regular security audits performed

### Security Headers Verification

```bash
# Check security headers
curl -I https://gatech-community.web.app | grep -i "security\|frame\|content-type"

# Should see:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Content-Security-Policy: [policy]
```

---

## Appendix

### Sample Environment Variables (.env.example)

```env
# Firebase Configuration (Get from Firebase Console)
FIREBASE_API_KEY=AIzaSyD...
FIREBASE_AUTH_DOMAIN=gatech-community.firebaseapp.com
FIREBASE_PROJECT_ID=gatech-community
FIREBASE_STORAGE_BUCKET=gatech-community.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123
FIREBASE_MEASUREMENT_ID=G-ABC123

# OAuth Configuration
GITHUB_CLIENT_ID=Iv1.abc123...
GITHUB_CLIENT_SECRET=abc123...
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...

# App Configuration
APP_ENV=production
APP_URL=https://gatech-community.web.app
APP_NAME=GA Tech AI & Vibe-Coding Community

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_ERROR_REPORTING=true
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_OFFLINE_SUPPORT=true

# API Keys (if using external services)
SENDGRID_API_KEY=SG.abc123...
ALGOLIA_APP_ID=ABC123
ALGOLIA_API_KEY=abc123...
```

### Useful Scripts Collection

Create a `scripts/` directory with these helpful utilities:

**scripts/create-admin.js**
```javascript
#!/usr/bin/env node
const admin = require('firebase-admin');
admin.initializeApp();

async function makeAdmin(email) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`User ${email} is now an admin`);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node create-admin.js <email>');
  process.exit(1);
}

makeAdmin(email);
```

**scripts/migrate-data.js**
```javascript
#!/usr/bin/env node
const admin = require('firebase-admin');
admin.initializeApp();

async function migrateData() {
  const db = admin.firestore();
  const batch = db.batch();

  // Example: Add a new field to all documents
  const snapshot = await db.collection('posts').get();

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      version: '2.0',
      migrated_at: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log(`Migrated ${snapshot.size} documents`);
}

migrateData();
```

---

## Support and Contact

For issues specific to this deployment:
- **Documentation Issues:** Create an issue in the project repository
- **Firebase Issues:** https://firebase.google.com/support
- **Security Issues:** Email security@your-domain.edu (do not post publicly)

## License and Credits

GA Tech AI & Vibe-Coding Community Platform
Version 1.0.0 - September 2025
Built with Firebase, Progressive Web App technologies

---

*Last Updated: September 2025*
*Documentation Version: 1.0.0*