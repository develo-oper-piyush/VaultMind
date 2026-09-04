# Use official Node.js 20 Alpine base image for compatibility with Express 5 & native modules
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system build dependencies required for native packages like bcrypt
RUN apk add --no-cache python3 make g++

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

# Install application dependencies
RUN npm ci

# Copy remaining application source code
COPY . .

# Expose backend port
EXPOSE 5000

# Set production environment defaults
ENV PORT=5000
ENV NODE_ENV=production

# Start application server directly with Node
CMD ["node", "app.js"]
