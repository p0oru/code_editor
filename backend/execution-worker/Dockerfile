# ============================================
# Execution Worker Dockerfile
# ============================================
# WHY THIS CONFIGURATION:
# 
# 1. Multi-stage build: We use golang:alpine for building (has Go toolchain)
#    and alpine for runtime (minimal footprint ~5MB base).
#
# 2. Docker CLI Installation: The Go app uses the Docker SDK to communicate
#    with the Docker daemon via the mounted socket. The SDK handles all
#    communication - we don't need the Docker CLI binary. However, we install
#    it for debugging/verification purposes in development.
#
# 3. Docker Socket Mount: The /var/run/docker.sock volume mount (defined in
#    docker-compose.yml) allows this container to spawn "sibling containers"
#    on the host Docker daemon - this is how we'll execute user code safely.
#
# 4. Security Note: Access to the Docker socket is essentially root access
#    to the host. In production, consider Docker-in-Docker (DinD) or
#    rootless Docker for better isolation.
# ============================================

# Stage 1: Build
FROM golang:1.23-alpine AS builder

# Install git for fetching dependencies (some Go modules need it)
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Cache dependencies
COPY go.mod go.sum* ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=1.0.0" \
    -o execution-worker \
    main.go

# Stage 2: Runtime
FROM alpine:3.20

# Install Docker CLI for debugging/verification
# The Go application uses the Docker SDK, not the CLI, but having
# the CLI available helps with debugging container issues
RUN apk add --no-cache \
    ca-certificates \
    docker-cli \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Security: Create non-root user
# Note: User needs to be in docker group to access socket
RUN addgroup -S worker && \
    adduser -S -G worker worker

# Copy the binary from builder
COPY --from=builder /build/execution-worker .

# The docker.sock permission issue:
# The socket on the host is typically owned by root:docker
# We'll run as root for now (required for socket access)
# In production, configure proper group permissions

# Set environment variables
ENV REDIS_URL=redis://redis:6379
ENV MONGO_URL=mongodb://mongo:27017

# No EXPOSE needed - worker pulls from queue, doesn't serve HTTP
# Health can be monitored via Docker's native health checks

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep execution-worker || exit 1

CMD ["./execution-worker"]

