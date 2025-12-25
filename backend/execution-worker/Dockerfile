# ============================================
# Execution Worker Dockerfile
# ============================================
# FINAL STAGE: Production-Grade Docker Execution
# 
# This container:
# 1. Listens to Redis for job submissions
# 2. Spawns ephemeral Docker containers to execute code
# 3. Updates MongoDB with execution results
# 4. Notifies analysis worker via Redis Pub/Sub
#
# Note: This container requires root access to the Docker socket.
# The SPAWNED execution containers run as non-root (nobody user).
# ============================================

# Stage 1: Build
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go.mod and download dependencies
COPY go.mod ./
RUN go mod download && go mod tidy

# Copy source and build with optimizations
COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=4.0.0" \
    -o execution-worker \
    *.go

# Stage 2: Runtime
FROM alpine:3.20

# Install Docker CLI for debugging
RUN apk add --no-cache \
        ca-certificates \
        docker-cli \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Create execution volume directory with proper permissions
RUN mkdir -p /tmp/executions && chmod 1777 /tmp/executions

# Copy binary from builder
COPY --from=builder /build/execution-worker .

# Set environment variables
ENV REDIS_URL=redis://redis:6379
ENV MONGO_URL=mongodb://mongo:27017
ENV DOCKER_HOST=unix:///var/run/docker.sock

# Note: Running as root is required for Docker socket access.
# Security is maintained because:
# 1. This is a trusted internal service
# 2. The SPAWNED execution containers run as nobody with
#    - No network access
#    - Memory/CPU limits  
#    - All capabilities dropped
#    - 5 second timeout

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep execution-worker || exit 1

CMD ["./execution-worker"]
