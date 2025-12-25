# ============================================
# RCE Engine - Development Commands
# ============================================
# Usage: make <target>
# ============================================

.PHONY: help build up down logs clean verify dev

# Default target
help:
	@echo "RCE Engine - Available Commands:"
	@echo ""
	@echo "  make build    - Build all Docker images"
	@echo "  make up       - Start all services (detached)"
	@echo "  make down     - Stop all services"
	@echo "  make logs     - Follow logs for all services"
	@echo "  make clean    - Stop services and remove volumes"
	@echo "  make verify   - Verify all services are healthy"
	@echo "  make dev      - Start with development overrides"
	@echo ""

# Build all images
build:
	docker compose build

# Start all services
up:
	docker compose up -d
	@echo ""
	@echo "Services starting..."
	@echo "  Frontend:    http://localhost:5173"
	@echo "  API Gateway: http://localhost:3000"
	@echo "  API Health:  http://localhost:3000/health"
	@echo ""

# Stop all services
down:
	docker compose down

# Follow logs
logs:
	docker compose logs -f

# Clean up everything including volumes
clean:
	docker compose down -v --remove-orphans
	docker system prune -f

# Verify services are running
verify:
	@echo "Checking service health..."
	@echo ""
	@echo "=== Container Status ==="
	docker compose ps
	@echo ""
	@echo "=== API Gateway Health ==="
	@curl -s http://localhost:3000/health | python -m json.tool 2>/dev/null || echo "API Gateway not responding"
	@echo ""
	@echo "=== Worker Docker Socket ==="
	docker exec rce-execution-worker ls -la /var/run/docker.sock 2>/dev/null || echo "Worker not running or socket not mounted"
	@echo ""
	@echo "=== Worker Logs (last 10 lines) ==="
	docker compose logs --tail=10 execution-worker

# Development mode with hot-reload
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Individual service logs
logs-api:
	docker compose logs -f api-gateway

logs-worker:
	docker compose logs -f execution-worker

logs-frontend:
	docker compose logs -f frontend

