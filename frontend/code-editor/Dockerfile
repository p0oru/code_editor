# ============================================
# Frontend Dockerfile - Development Mode
# ============================================
# For development, we use Vite's dev server with hot reload.
# The source code is mounted as a volume in docker-compose.yml
# so changes are reflected immediately.
# ============================================

FROM node:22-alpine

WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install

# Copy source (will be overridden by volume mount in development)
COPY . .

EXPOSE 5173

# Run Vite dev server
CMD ["npm", "run", "dev"]

