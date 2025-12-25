# ============================================
# RCE Engine - Development Commands
# ============================================
# Usage: make <target>
# Stage 3: Docker-based Code Execution
# ============================================

.PHONY: help build up down logs clean verify dev pull-images test-python test-js test-timeout

# Default target
help:
	@echo "RCE Engine - Available Commands:"
	@echo ""
	@echo "  === Core Commands ==="
	@echo "  make build       - Build all Docker images"
	@echo "  make up          - Start all services (detached)"
	@echo "  make down        - Stop all services"
	@echo "  make logs        - Follow logs for all services"
	@echo "  make clean       - Stop services and remove volumes"
	@echo "  make verify      - Verify all services are healthy"
	@echo "  make dev         - Start with development overrides"
	@echo ""
	@echo "  === Stage 3: Code Execution ==="
	@echo "  make pull-images - Pre-pull execution container images"
	@echo "  make test-python - Submit a Python test job"
	@echo "  make test-js     - Submit a JavaScript test job"
	@echo "  make test-timeout- Submit an infinite loop (timeout test)"
	@echo ""

# Build all images
build:
	docker compose build

# Start all services
up:
	docker compose up -d
	@echo ""
	@echo "Services starting..."
	@echo "  Frontend:    http://localhost:4000"
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
	@echo "=== Execution Volume ==="
	docker exec rce-execution-worker ls -la /tmp/executions 2>/dev/null || echo "Execution volume not ready"
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

# ============================================
# Stage 3: Code Execution Testing
# ============================================

# Pre-pull execution images to avoid timeout on first run
pull-images:
	@echo "Pulling execution container images..."
	docker pull python:3.9-alpine
	docker pull node:18-alpine
	@echo "Done! Images are ready for code execution."

# Test Python execution - simple math problem
test-python:
	@echo "Submitting Python test job..."
	@curl -X POST http://localhost:3000/submit \
		-H "Content-Type: application/json" \
		-d '{"language": "python", "code": "# Calculate the sum of first 100 numbers\nresult = sum(range(1, 101))\nprint(f\"The sum of numbers 1 to 100 is: {result}\")\n\n# Verify with formula: n(n+1)/2\nformula_result = 100 * 101 // 2\nprint(f\"Verification using formula: {formula_result}\")\nprint(f\"Match: {result == formula_result}\")"}' \
		| python -m json.tool
	@echo ""
	@echo "Check worker logs: make logs-worker"
	@echo "Check MongoDB: mongosh --eval \"db.submissions.find().sort({submittedAt:-1}).limit(1).pretty()\""

# Test JavaScript execution
test-js:
	@echo "Submitting JavaScript test job..."
	@curl -X POST http://localhost:3000/submit \
		-H "Content-Type: application/json" \
		-d '{"language": "javascript", "code": "// Calculate factorial of 10\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}\n\nconst n = 10;\nconst result = factorial(n);\nconsole.log(`Factorial of ${n} is: ${result}`);\nconsole.log(`Verification: 10! = 3628800, Match: ${result === 3628800}`);"}' \
		| python -m json.tool
	@echo ""
	@echo "Check worker logs: make logs-worker"

# Test timeout handling - infinite loop
test-timeout:
	@echo "Submitting infinite loop (should timeout after 5s)..."
	@curl -X POST http://localhost:3000/submit \
		-H "Content-Type: application/json" \
		-d '{"language": "python", "code": "# This will timeout!\nimport time\nprint(\"Starting infinite loop...\")\nwhile True:\n    time.sleep(0.1)"}' \
		| python -m json.tool
	@echo ""
	@echo "Check worker logs to see timeout handling: make logs-worker"

# Test memory limit
test-memory:
	@echo "Submitting memory-heavy job (should fail with OOM)..."
	@curl -X POST http://localhost:3000/submit \
		-H "Content-Type: application/json" \
		-d '{"language": "python", "code": "# Try to allocate more than 128MB\ndata = []\nfor i in range(1000000):\n    data.append(\"x\" * 1000)\n    if i % 10000 == 0:\n        print(f\"Allocated {i * 1000} bytes\")"}' \
		| python -m json.tool

# Check MongoDB for latest submission results
check-results:
	@echo "Latest 3 submissions from MongoDB:"
	@docker exec rce-mongo mongosh --quiet rce-engine --eval "db.submissions.find().sort({submittedAt:-1}).limit(3).forEach(doc => printjson(doc))"
