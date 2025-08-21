# Use official Node.js runtime as base image
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with specific npm version and timeout settings
RUN npm ci --ignore-scripts --timeout 300000

# Copy scripts and source code
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

# Generate version and build
RUN npm run prebuild && npm run build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies with timeout
RUN npm ci --only=production --ignore-scripts --timeout 300000 && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 && \
    chown -R mcp:nodejs /app

# Switch to non-root user
USER mcp

# Set environment variables
ENV NODE_ENV=production

# Run the application
CMD ["node", "build/index.js"]