# 🚀 Quick Deploy to Fly.io - GA Tech Reddit

## ✅ Status: READY TO DEPLOY

All files configured for:
- **App name**: gatech-reddit
- **Region**: atl (Atlanta)
- **Cost**: ~$2/month (under your $5 budget!)

---

## Step 1: Install Fly CLI (5 minutes)

Open PowerShell as Admin:

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Close and reopen PowerShell after install.

---

## Step 2: Login to Fly.io (1 minute)

```powershell
cd "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"
fly auth login
```

**Important**: When browser opens, login with your existing Fly.io account!

---

## Step 3: Create Supabase Project (3 minutes)

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Fill in:
   - **Name**: gatech-reddit
   - **Database Password**: (generate strong password - SAVE IT!)
   - **Region**: East US (closest to Atlanta)
6. Click "Create new project"
7. Wait 2-3 minutes for setup

Once ready, go to **Settings → API**:
- Copy **Project URL** (looks like `https://xxxxx.supabase.co`)
- Copy **anon public** key (long string starting with `eyJ...`)

---

## Step 4: Set Up Database (2 minutes)

In Supabase dashboard:

1. Click **SQL Editor** in left sidebar
2. Click **+ New Query**
3. Open `database-schema.sql` from your project folder
4. Copy all contents and paste into SQL Editor
5. Click **Run** (bottom right)

You should see "Success. No rows returned" - that's correct!

---

## Step 5: Configure OAuth (5 minutes)

### GitHub OAuth:

1. Go to https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: GA Tech Reddit
   - **Homepage URL**: `https://gatech-reddit.fly.dev`
   - **Authorization callback URL**: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
     (Replace YOUR_PROJECT_ID with yours from Supabase URL)
4. Click **Register application**
5. Copy **Client ID** and **Client Secret**

### In Supabase:

1. Go to **Authentication → Providers**
2. Find **GitHub**
3. Toggle it **Enabled**
4. Paste your Client ID and Client Secret
5. Click **Save**

### Google OAuth (Optional):

Same process but use Google Cloud Console:
1. Go to https://console.cloud.google.com
2. Create OAuth 2.0 credentials
3. Add to Supabase

---

## Step 6: Deploy to Fly.io (5 minutes)

```powershell
cd "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"

# Set your Supabase credentials
fly secrets set SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
fly secrets set SUPABASE_ANON_KEY="eyJxxxxx..."
fly secrets set GITHUB_CLIENT_ID="your_github_client_id"
fly secrets set GITHUB_CLIENT_SECRET="your_github_client_secret"

# Deploy!
fly deploy --region atl
```

Wait 2-3 minutes for build and deployment.

---

## Step 7: Test It! (2 minutes)

```powershell
fly open
```

This opens your app at `https://gatech-reddit.fly.dev`

**Test checklist**:
- [ ] Landing page loads
- [ ] Click "Sign in with GitHub"
- [ ] Authorize the app
- [ ] You're logged in!
- [ ] Try creating a post
- [ ] Try commenting
- [ ] Try voting

---

## 🎉 You're Live!

Your GA Tech Reddit is now running on:
- **URL**: https://gatech-reddit.fly.dev
- **Cost**: ~$2/month (scales to zero when idle)
- **Database**: PostgreSQL on Supabase (free tier)
- **Capacity**: 50,000 monthly active users

---

## 🔧 Useful Commands

```powershell
# Check status
fly status

# View logs
fly logs

# Open app
fly open

# SSH into container
fly ssh console

# Scale resources (if needed later)
fly scale memory 512

# Stop app (to save money)
fly scale count 0

# Start app again
fly scale count 1
```

---

## 🐛 Troubleshooting

**Deploy fails?**
```powershell
fly doctor
fly logs
```

**App won't start?**
```powershell
fly logs
```

**OAuth not working?**
- Check callback URL matches in GitHub OAuth settings
- Make sure Client ID/Secret are correct in fly secrets

**Database errors?**
- Verify database-schema.sql ran successfully in Supabase
- Check Supabase logs

---

## 💰 Cost Monitoring

```powershell
# Check current usage
fly dashboard

# Set spending limit (already configured in fly.toml)
fly orgs list
```

Your app is configured to:
- Auto-stop when idle (saves money)
- Use minimal resources (256MB RAM)
- Stay under $5/month comfortably

---

## 🚀 Next Steps

1. **Add content moderation**: Create admin user in Supabase
2. **Custom domain**: `fly certs add reddit.gatech.edu` (if you have access)
3. **Analytics**: Add Plausible or Umami
4. **Backups**: Supabase handles this automatically

---

## 📞 Support

**Stuck?** Check these:
- Fly.io docs: https://fly.io/docs
- Supabase docs: https://supabase.com/docs
- Your MIGRATION_GUIDE.md file

**Everything working?** Share with GA Tech community! 🎓

---

**Estimated Total Time**: 20-25 minutes
**Estimated Cost**: $2-3/month
**Users Supported**: Up to 50,000 monthly active

Let's ship it! 🚀
