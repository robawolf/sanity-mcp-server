FROM node:18-alpine

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create user and set permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 && \
    chown -R mcp:nodejs /app

USER mcp

CMD ["node", "build/index.js"]