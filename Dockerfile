# Multi-stage Dockerfile for GA Tech Reddit System
# Optimized for minimal size and fast cold starts on Fly.io
# Budget: $5/month (shared-cpu-1x with 256MB RAM)

# Stage 1: Build stage for optimizing assets
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /build

# Copy all static files
COPY index.html feed.html post.html profile.html create-post.html offline.html ./
COPY styles/ ./styles/
COPY js/ ./js/
COPY manifest.json ./
COPY service-worker.js sw-register.js ./

# Install minification tools for production optimization
RUN npm install -g \
    html-minifier-terser \
    terser \
    clean-css-cli && \
    # Minify HTML files (preserve comments for debugging)
    for file in *.html; do \
        html-minifier-terser \
            --collapse-whitespace \
            --remove-comments \
            --remove-optional-tags \
            --remove-redundant-attributes \
            --remove-script-type-attributes \
            --remove-tag-whitespace \
            --use-short-doctype \
            --minify-css true \
            --minify-js true \
            "$file" -o "$file.min" && \
        mv "$file.min" "$file"; \
    done && \
    # Minify JavaScript files
    for file in js/*.js; do \
        terser "$file" \
            --compress \
            --mangle \
            --output "$file.min" && \
        mv "$file.min" "$file"; \
    done && \
    # Minify service worker files
    for file in *.js; do \
        if [ -f "$file" ]; then \
            terser "$file" \
                --compress \
                --mangle \
                --output "$file.min" && \
            mv "$file.min" "$file"; \
        fi; \
    done && \
    # Minify CSS files
    for file in styles/*.css; do \
        cleancss \
            --level 2 \
            --output "$file.min" \
            "$file" && \
        mv "$file.min" "$file"; \
    done

# Stage 2: Production nginx image
FROM nginx:alpine-slim

# Install required packages and clean up to reduce image size
RUN apk add --no-cache \
    curl \
    tzdata && \
    # Set timezone to Eastern for Georgia Tech
    cp /usr/share/zoneinfo/America/New_York /etc/localtime && \
    echo "America/New_York" > /etc/timezone && \
    # Clean up package cache
    rm -rf /var/cache/apk/*

# Remove default nginx configuration
RUN rm -rf /usr/share/nginx/html/* && \
    rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy minified static files from builder
COPY --from=builder /build/*.html /usr/share/nginx/html/
COPY --from=builder /build/styles /usr/share/nginx/html/styles/
COPY --from=builder /build/js /usr/share/nginx/html/js/
COPY --from=builder /build/manifest.json /usr/share/nginx/html/
COPY --from=builder /build/service-worker.js /usr/share/nginx/html/
COPY --from=builder /build/sw-register.js /usr/share/nginx/html/

# Create directories for nginx
RUN mkdir -p /var/cache/nginx/client_temp && \
    mkdir -p /var/run && \
    mkdir -p /var/log/nginx && \
    # Set proper permissions
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/run && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    # Make nginx run as non-root user for security
    chmod -R 755 /usr/share/nginx/html

# Create a simple health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Add environment variable injection script
# This allows runtime configuration of Supabase credentials
COPY <<'SCRIPT' /docker-entrypoint.sh
#!/bin/sh
set -e

# Function to replace environment variables in JavaScript files
replace_env_vars() {
    # Create a config file with environment variables
    cat > /usr/share/nginx/html/js/env-config.js <<EOF
// Runtime environment configuration
// Auto-generated at container startup
window.ENV_CONFIG = {
    SUPABASE_URL: "${SUPABASE_URL:-}",
    SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}",
    GITHUB_CLIENT_ID: "${GITHUB_CLIENT_ID:-}",
    APP_URL: "${APP_URL:-https://gatech-reddit.fly.dev}",
    NODE_ENV: "${NODE_ENV:-production}"
};

// Log configuration status (remove in production if needed)
console.log('Environment configured:', {
    supabaseConfigured: !!window.ENV_CONFIG.SUPABASE_URL,
    githubConfigured: !!window.ENV_CONFIG.GITHUB_CLIENT_ID,
    environment: window.ENV_CONFIG.NODE_ENV
});
EOF

    # Inject the config script into all HTML files
    for file in /usr/share/nginx/html/*.html; do
        if [ -f "$file" ]; then
            # Add env-config.js before the first script tag
            sed -i 's|<script|<script src="/js/env-config.js"></script>\n    <script|' "$file"
            # Remove duplicate injections
            awk '!seen[$0]++' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        fi
    done
}

# Replace environment variables
replace_env_vars

# Start nginx
exec nginx -g 'daemon off;'
SCRIPT

# Make entrypoint executable
RUN chmod +x /docker-entrypoint.sh

# Expose port 8080 (Fly.io standard)
EXPOSE 8080

# Use non-root user for security
USER nginx

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Labels for container metadata
LABEL maintainer="GA Tech Reddit Team" \
      version="1.0.0" \
      description="GA Tech Reddit System - Static Web Application" \
      org.opencontainers.image.source="https://github.com/gatech/reddit-system"

# Set entrypoint and command
ENTRYPOINT ["/docker-entrypoint.sh"]