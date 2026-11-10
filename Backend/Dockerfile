# Multi-stage Dockerfile for Backend (Node.js 20 / Express 5)

# Stage 1: Base image with system build tools
FROM node:20-alpine AS base
WORKDIR /app

# Install system build dependencies required for native packages (bcrypt, Tailwind CLI, c-ares)
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

# Install application dependencies
RUN npm ci

# Stage 2: Development Stage (Used by docker-compose.dev.yml)
FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
ENV PORT=5000
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Stage 3: Production Stage (Default for docker-compose.yml)
FROM base AS production
WORKDIR /app

# Copy application source code with proper ownership
COPY --chown=node:node . .

# Expose backend REST API port
EXPOSE 5000

# Set production environment defaults
ENV PORT=5000
ENV NODE_ENV=production

# Container Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

# Run as non-root user for security
USER node

# Start application server directly with Node
CMD ["node", "app.js"]
