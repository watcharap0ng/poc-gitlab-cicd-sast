# Multi-stage Node.js Dockerfile optimized for security and size
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NPM_CONFIG_PROGRESS=false

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create app directory with proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with npm ci for reliability and speed
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nextjs:nodejs . .

# Run linting and tests (skip for production builds to speed up)
RUN if [ "$NODE_ENV" != "production" ]; then \
        npm run lint:check && \
        npm run test; \
    fi

# Build application
RUN npm run build

# Stage 2: Production stage with minimal attack surface
FROM node:18-alpine AS production

# Security: Install only necessary runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV USER=nextjs

# Create app directory
WORKDIR /app

# Copy built application and dependencies from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

# Change to non-root user
USER nextjs

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT}/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]