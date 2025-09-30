# GA Tech Reddit System - Fly.io Deployment Guide

## Quick Start (Windows)

1. **Install Fly CLI**
   ```powershell
   # Run in PowerShell as Administrator
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login to Fly.io**
   ```powershell
   fly auth login
   ```

3. **Configure Secrets**
   ```powershell
   # Set your Supabase credentials
   fly secrets set SUPABASE_URL=your-supabase-url
   fly secrets set SUPABASE_ANON_KEY=your-anon-key

   # Set GitHub OAuth credentials
   fly secrets set GITHUB_CLIENT_ID=your-client-id
   fly secrets set GITHUB_CLIENT_SECRET=your-client-secret
   ```

4. **Deploy**
   ```powershell
   # Using PowerShell script
   .\deploy.ps1 deploy

   # Or directly with Fly CLI
   fly deploy
   ```

## Files Created

### Core Deployment Files
- **fly.toml** - Fly.io app configuration (optimized for $5/month budget)
- **Dockerfile** - Multi-stage build for minimal size (nginx-based)
- **nginx.conf** - Web server config with SPA routing, compression, caching
- **.dockerignore** - Excludes unnecessary files from Docker build

### Scripts
- **deploy.sh** - Linux/Mac deployment script
- **deploy.ps1** - Windows PowerShell deployment script

### Configuration
- **.env.example** - Environment variables template

## Budget Optimization ($5/month)

The configuration uses:
- **VM Size**: shared-cpu-1x (256MB RAM)
- **Region**: atl (Atlanta - closest to Georgia Tech)
- **Auto-stop**: Enabled (saves money when idle)
- **Min Machines**: 0 (scales to zero when not in use)

## Key Features

1. **Production-Ready**
   - Minified HTML/CSS/JS for fast loading
   - Gzip compression enabled
   - Security headers configured
   - Health checks implemented

2. **Performance Optimized**
   - Static file caching (1 year for assets)
   - HTML caching (5 minutes)
   - nginx optimizations for low memory

3. **SPA Support**
   - All routes fallback to index.html
   - Proper MIME types
   - Service worker support

4. **Security**
   - CSP headers configured
   - XSS protection
   - Frame options set to DENY
   - Rate limiting enabled

## Deployment Commands

### Windows (PowerShell)
```powershell
# Deploy application
.\deploy.ps1 deploy

# Check status
.\deploy.ps1 status

# View logs
.\deploy.ps1 logs

# List secrets
.\deploy.ps1 secrets

# SSH into container
.\deploy.ps1 ssh

# Rollback to previous version
.\deploy.ps1 rollback

# Destroy app (careful!)
.\deploy.ps1 destroy
```

### Linux/Mac (Bash)
```bash
# Make script executable
chmod +x deploy.sh

# Deploy application
./deploy.sh deploy

# Other commands same as above
./deploy.sh status
./deploy.sh logs
# etc...
```

## Manual Deployment

If you prefer manual control:

```bash
# 1. Create app (first time only)
fly apps create gatech-reddit

# 2. Set secrets
fly secrets set SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy

# 3. Deploy
fly deploy

# 4. Open in browser
fly open
```

## Monitoring

After deployment, monitor your app:

```bash
# Real-time logs
fly logs

# App status
fly status

# Resource usage
fly scale show

# Open dashboard
fly dashboard
```

## Troubleshooting

### App won't start
- Check logs: `fly logs`
- Verify secrets: `fly secrets list`
- Check health: `curl https://gatech-reddit.fly.dev/health`

### Out of memory
- App is optimized for 256MB
- If issues persist, scale up: `fly scale memory 512`

### Build fails
- Ensure Docker is installed (optional)
- Check .dockerignore isn't excluding needed files
- Try: `fly deploy --local-only=false` (build on Fly.io)

### Secrets not working
- Verify all required secrets are set
- Restart app: `fly apps restart gatech-reddit`

## URLs

- **Production**: https://gatech-reddit.fly.dev
- **Health Check**: https://gatech-reddit.fly.dev/health
- **Fly Dashboard**: https://fly.io/apps/gatech-reddit

## Cost Management

To stay within $5/month:
1. Keep auto-stop enabled
2. Use single instance (no HA)
3. Monitor usage: `fly dashboard`
4. Set spending alerts in Fly.io dashboard

## Next Steps

1. Set up custom domain (optional)
2. Configure CDN for static assets (optional)
3. Set up monitoring/alerts (optional)
4. Configure backup strategy for Supabase

## Support

- Fly.io Docs: https://fly.io/docs
- Supabase Docs: https://supabase.com/docs
- GitHub OAuth: https://docs.github.com/en/developers/apps