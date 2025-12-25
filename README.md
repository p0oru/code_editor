# ⚡ RCE Engine - Remote Code Execution Platform

A production-grade platform for executing user-submitted code safely in isolated Docker containers with full observability.

![Stage](https://img.shields.io/badge/Stage-Final%20Production-success)
![Docker](https://img.shields.io/badge/Docker-Compose%20V2-2496ED?logo=docker)
![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)
![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go)
![Python](https://img.shields.io/badge/Python-3.9-3776AB?logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus)
![Grafana](https://img.shields.io/badge/Grafana-F46800?logo=grafana)

---

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Security Features](#-security-features)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Monitoring & Observability](#-monitoring--observability)
- [Testing Code Execution](#-testing-code-execution)
- [Project Structure](#-project-structure)
- [Services](#-services)
- [Development](#-development)
- [Stage Roadmap](#-stage-roadmap)
- [Troubleshooting](#-troubleshooting)

---

## 🏗 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         RCE Engine - Production Architecture                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        NGINX API GATEWAY (Port 80)                       │   │
│   │                    Single Entry Point for All Traffic                    │   │
│   └────────────┬─────────────────────┬──────────────────────┬───────────────┘   │
│                │  / (frontend)       │ /api/* (backend)     │ /analysis/*       │
│                ▼                     ▼                      ▼                   │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│   │    Frontend     │    │   API Gateway   │    │ Analysis Worker │            │
│   │    (React)      │    │   (Node.js)     │    │    (Python)     │            │
│   │   Port 5173     │    │   Port 3000     │    │   Port 8000     │            │
│   └─────────────────┘    └────────┬────────┘    └────────┬────────┘            │
│                                   │                      │                      │
│                                   ▼                      │ (Pub/Sub)            │
│                          ┌─────────────────┐             │                      │
│                          │     Redis       │◄────────────┘                      │
│                          │    (Queue)      │                                    │
│                          │   Port 6379     │                                    │
│                          └────────┬────────┘                                    │
│                                   │                                             │
│                                   ▼                                             │
│                          ┌─────────────────┐      ┌─────────────────┐          │
│                          │ Execution Worker│──────│  Docker Socket  │          │
│                          │      (Go)       │      │ (Host Daemon)   │          │
│                          └────────┬────────┘      └────────┬────────┘          │
│                                   │                        │                    │
│                                   ▼                        ▼                    │
│                          ┌─────────────────┐      ┌────────────────────┐       │
│                          │     MongoDB     │      │ Ephemeral Sandboxes│       │
│                          │   Port 27017    │      │ • Memory: 128MB    │       │
│                          └─────────────────┘      │ • CPU: 0.5 cores   │       │
│                                                   │ • Network: None    │       │
│                                                   │ • Timeout: 5s      │       │
│   ┌──────────────────────────────────────────────┐└────────────────────┘       │
│   │              OBSERVABILITY STACK              │                            │
│   │  ┌──────────┐  ┌───────────┐  ┌──────────┐   │                            │
│   │  │ cAdvisor │──│Prometheus │──│ Grafana  │   │                            │
│   │  │ :8080    │  │   :9090   │  │  :3001   │   │                            │
│   │  └──────────┘  └───────────┘  └──────────┘   │                            │
│   └──────────────────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** accesses the application via **Nginx** on port 80
2. **Nginx** routes to **Frontend** (/) or **API Gateway** (/api/*)
3. **API Gateway** validates, queues jobs in **Redis**, saves to **MongoDB**
4. **Execution Worker** pulls jobs and spawns isolated **ephemeral containers**
5. Code runs with strict **resource limits** (128MB RAM, 0.5 CPU, no network)
6. Worker publishes to **Analysis Queue** → **Python Worker** performs static analysis
7. Results + analysis reports stored in **MongoDB**
8. **Prometheus** scrapes metrics, **Grafana** visualizes them

---

## 🔒 Security Features

The execution engine implements multiple layers of security:

| Security Layer | Implementation | Purpose |
|----------------|----------------|---------|
| **Network Isolation** | `NetworkDisabled: true` | User code cannot access internet or internal services |
| **Memory Limits** | 128MB max (no swap) | Prevents memory exhaustion attacks |
| **CPU Limits** | 0.5 cores | Prevents CPU exhaustion |
| **Execution Timeout** | 5 seconds | Kills infinite loops |
| **Process Limits** | 50 PIDs max | Prevents fork bombs |
| **Capability Drop** | All capabilities dropped | Minimal container privileges |
| **No New Privileges** | SecurityOpt flag | Prevents privilege escalation |
| **Read-Only Code** | Code volume mounted read-only | Prevents code modification |
| **Non-Root Containers** | All services run as non-root | Minimal user privileges |
| **Ephemeral Containers** | Auto-removed after execution | No persistent state |
| **Static Analysis** | Python AST/regex scanning | Detects dangerous code patterns |
| **Rate Limiting** | Nginx rate limiting | Prevents API abuse |

---

## ✅ Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Docker Desktop** | 4.x+ | [Download](https://www.docker.com/products/docker-desktop/) |
| **Docker Compose** | V2 | Bundled with Docker Desktop |
| **Git** | 2.x+ | For version control |

### Windows Users
- Ensure WSL 2 backend is enabled in Docker Desktop settings
- The Docker socket path is virtualized automatically

### macOS/Linux Users
- Docker socket is at `/var/run/docker.sock`
- May need to adjust socket permissions for the worker

---

## 🚀 Quick Start

### 1. Clone and Navigate

```bash
git clone <your-repo-url>
cd code_executor
```

### 2. Build and Start All Services

```bash
# Build and start (detached mode)
docker compose up --build -d

# Or use Makefile
make build && make up
```

### 3. Pull Execution Images (First Time)

```bash
# Pre-pull Python and Node.js images
docker pull python:3.9-alpine
docker pull node:18-alpine

# Or use Makefile
make pull-images
```

### 4. Access the Application

| Service | URL | Purpose |
|---------|-----|---------|
| **Application** | http://localhost | Main entry (via Nginx) |
| **Grafana** | http://localhost:3001 | Monitoring dashboards |
| **Prometheus** | http://localhost:9090 | Metrics & queries |
| **cAdvisor** | http://localhost:8080 | Container metrics |

### 5. Verify Services

```bash
# Check all containers are running
docker compose ps

# Test via Nginx gateway
curl http://localhost/api/health

# Test Grafana
curl http://localhost:3001/api/health
```

---

## 📊 Monitoring & Observability

### Why Observability Matters for RCE Systems

When managing ephemeral containers for code execution, observability is **critical** because:

1. **Ephemeral Nature**: Execution containers live for seconds. Traditional logging misses them. You need real-time metrics to see CPU/memory spikes.

2. **Security Monitoring**: Detect abnormal resource usage that might indicate attack attempts (fork bombs, memory exhaustion).

3. **Performance Tuning**: See how much CPU the execution worker spikes when running user code to optimize resource limits.

4. **Capacity Planning**: Understand baseline vs. peak load to scale workers appropriately.

5. **Debugging**: When executions fail mysteriously, metrics help identify whether it's resource exhaustion, timeouts, or other issues.

### Accessing Grafana

1. **Navigate to**: http://localhost:3001
2. **Default Credentials**:
   - Username: `admin`
   - Password: `rceadmin`
3. **Pre-configured Dashboard**: Go to **Dashboards** → **RCE Engine** → **RCE Engine Dashboard**

### Dashboard Features

The pre-configured Grafana dashboard shows:

| Panel | Description |
|-------|-------------|
| **CPU Usage by Container** | Real-time CPU usage for all rce-* containers |
| **Memory Usage by Container** | Memory consumption with historical trends |
| **Execution Worker CPU Gauge** | Current CPU usage of the Go worker |
| **Execution Worker Memory Gauge** | Current memory usage with thresholds |
| **Network I/O** | Inbound/outbound traffic per container |
| **Service Status** | Up/down status of all services |
| **Running Containers** | Count of active RCE containers |
| **Total Memory/Network Stats** | Aggregate resource usage |

### Key Metrics to Watch

```promql
# CPU spike during code execution
rate(container_cpu_usage_seconds_total{name="rce-execution-worker"}[1m]) * 100

# Memory usage of execution containers
container_memory_usage_bytes{name=~"rce-exec-.*"}

# Network isolation verification (should be zero for exec containers)
rate(container_network_receive_bytes_total{name=~"rce-exec-.*"}[1m])
```

### Prometheus Queries

Access Prometheus at http://localhost:9090/graph and try:

```promql
# All RCE container memory
sum(container_memory_usage_bytes{name=~"rce-.*"}) by (name)

# API Gateway request latency (if instrumented)
http_request_duration_seconds_bucket{service="api-gateway"}

# Container restart count (reliability indicator)
increase(container_restart_count{name=~"rce-.*"}[1h])
```

### Alert Examples (for production)

```yaml
# High memory usage alert
- alert: HighMemoryUsage
  expr: container_memory_usage_bytes{name="rce-execution-worker"} > 200000000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Execution worker memory usage high"

# Execution worker down
- alert: ExecutionWorkerDown
  expr: absent(container_last_seen{name="rce-execution-worker"})
  for: 1m
  labels:
    severity: critical
```

---

## 🧪 Testing Code Execution

### Using the Web UI

1. Open http://localhost in your browser
2. Write or edit code in the Monaco editor
3. Select language (Python/JavaScript)
4. Click **Run Code**
5. View output in the terminal panel
6. View security analysis in the Analysis panel

### Using curl via Nginx

```bash
# Submit Python code
curl -X POST http://localhost/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "code": "print(sum(range(1, 101)))"
  }'

# Submit JavaScript code
curl -X POST http://localhost/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "language": "javascript",
    "code": "console.log(Array.from({length:100},(_,i)=>i+1).reduce((a,b)=>a+b))"
  }'

# Check job status
curl http://localhost/api/status/<jobId>
```

### Using PowerShell (Windows)

```powershell
cd test-scripts

# Run Python test
.\run-tests.ps1 python

# Run JavaScript test
.\run-tests.ps1 javascript

# Test timeout handling
.\run-tests.ps1 timeout

# Check results in MongoDB
.\run-tests.ps1 results
```

### Expected Results

After submission, the response includes:
- `jobId`: Unique job identifier
- `status`: queued → processing → completed/failed
- `output`: Execution stdout
- `executionTime`: Duration in milliseconds
- `analysisReport`: Static code analysis results

---

## 📁 Project Structure

```
code_executor/
├── backend/
│   ├── api-gateway/              # Node.js + Express + TypeScript
│   │   ├── src/
│   │   │   ├── index.ts          # Express server, routes
│   │   │   ├── models/
│   │   │   │   └── Submission.ts # MongoDB model
│   │   │   ├── services/
│   │   │   │   ├── mongo.ts      # MongoDB connection
│   │   │   │   └── redis.ts      # Redis queue service
│   │   │   └── types/
│   │   │       └── job.ts        # Shared type definitions
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── execution-worker/         # Go worker service
│   │   ├── main.go               # Worker entry point
│   │   ├── docker_provider.go    # Docker execution logic
│   │   ├── Dockerfile
│   │   └── go.mod
│   │
│   └── analysis-worker/          # Python analysis service
│       ├── main.py               # FastAPI + Redis subscriber
│       ├── analyzer.py           # AST/regex analysis logic
│       ├── requirements.txt
│       └── Dockerfile
│
├── frontend/
│   └── code-editor/              # React + Vite + TypeScript
│       ├── src/
│       │   ├── components/       # UI components
│       │   │   ├── CodeEditor.tsx
│       │   │   ├── Terminal.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── AnalysisPanel.tsx
│       │   │   └── Workspace.tsx
│       │   ├── services/
│       │   │   └── api.ts        # API client + polling
│       │   └── types/
│       │       └── api.ts        # TypeScript interfaces
│       ├── Dockerfile
│       ├── package.json
│       └── vite.config.ts
│
├── infrastructure/
│   ├── nginx/
│   │   └── nginx.conf            # Reverse proxy configuration
│   ├── prometheus/
│   │   └── prometheus.yml        # Metrics scraping config
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── datasources.yml
│           └── dashboards/
│               ├── dashboard.yml
│               └── rce-engine-dashboard.json
│
├── test-scripts/                 # Test files
│   ├── run-tests.ps1             # PowerShell test runner
│   ├── test-python.json          # Python test case
│   ├── test-javascript.json      # JS test case
│   └── test-timeout.json         # Timeout test
│
├── docker-compose.yml            # Full stack orchestration
├── Makefile                      # Development commands
└── README.md
```

---

## 🐳 Services

### Application Services

| Service | Technology | Internal Port | External Port | Purpose |
|---------|------------|---------------|---------------|---------|
| `nginx` | Nginx Alpine | 80 | 80 | API Gateway & reverse proxy |
| `frontend` | React + Vite | 5173 | - | Code editor UI |
| `api-gateway` | Node.js + Express | 3000 | - | REST API, validation |
| `execution-worker` | Go + Docker SDK | - | - | Spawns execution containers |
| `analysis-worker` | Python + FastAPI | 8000 | - | Static code analysis |
| `redis` | Redis 7 | 6379 | - | Job queue & Pub/Sub |
| `mongo` | MongoDB 7 | 27017 | - | Persistent storage |

### Observability Services

| Service | Technology | Port | Purpose |
|---------|------------|------|---------|
| `prometheus` | Prometheus | 9090 | Metrics collection |
| `grafana` | Grafana | 3001 | Dashboards & visualization |
| `cadvisor` | cAdvisor | 8080 | Container metrics exporter |

### Ephemeral Execution Containers

| Language | Image | Limits |
|----------|-------|--------|
| Python | `python:3.9-alpine` | 128MB RAM, 0.5 CPU, 5s timeout |
| JavaScript | `node:18-alpine` | 128MB RAM, 0.5 CPU, 5s timeout |

---

## 💻 Development

### Service Commands

```bash
# View logs for specific service
docker compose logs -f execution-worker

# Restart a service
docker compose restart execution-worker

# Stop all services
docker compose down

# Stop and remove volumes (reset data)
docker compose down -v
```

### Makefile Commands

```bash
make help          # Show all commands
make build         # Build all images
make up            # Start all services
make down          # Stop all services
make logs          # Follow all logs
make logs-worker   # Follow worker logs only
make verify        # Check service health
make clean         # Remove everything including data
```

---

## 🗺 Stage Roadmap

### Stage 1: Infrastructure ✅
- [x] Monorepo structure
- [x] Docker Compose orchestration
- [x] Service boilerplates
- [x] Network configuration

### Stage 2: Queue Integration ✅
- [x] Redis job queue
- [x] API Gateway → Redis producer
- [x] Go worker Redis consumer
- [x] MongoDB status tracking

### Stage 3: Code Execution ✅
- [x] Docker SDK integration
- [x] Ephemeral container spawning
- [x] Python/JavaScript execution
- [x] Resource limits & timeouts
- [x] Network isolation

### Stage 4: Static Analysis ✅
- [x] Python analysis worker
- [x] AST-based Python analysis
- [x] Regex-based JS analysis
- [x] Risk detection & scoring
- [x] Pub/Sub pipeline

### Stage 5: Frontend Dashboard ✅
- [x] Monaco code editor
- [x] Real-time polling
- [x] Analysis report display
- [x] Tailwind CSS styling

### Stage 6: Production Infrastructure ✅ (Final)
- [x] Nginx API Gateway
- [x] Prometheus metrics
- [x] Grafana dashboards
- [x] cAdvisor container metrics
- [x] Non-root containers
- [x] Resource limits on all services
- [x] Health checks throughout

---

## 🔧 Troubleshooting

### Nginx returns 502 Bad Gateway

```bash
# Check if backend services are running
docker compose ps

# Check API Gateway logs
docker compose logs api-gateway

# Verify Nginx can reach backends
docker exec rce-nginx wget -qO- http://api-gateway:3000/health
```

### Grafana shows "No data"

```bash
# Check Prometheus is scraping
curl http://localhost:9090/api/v1/targets

# Verify cAdvisor is running
curl http://localhost:8080/metrics | head

# Check Grafana data source
docker compose logs grafana
```

### Worker can't connect to Docker

```bash
# Check Docker socket mount
docker exec rce-execution-worker ls -la /var/run/docker.sock

# Check worker logs
docker compose logs execution-worker

# Verify Docker access
docker exec rce-execution-worker docker version
```

### Execution times out immediately

```bash
# Pre-pull images to avoid timeout during pull
docker pull python:3.9-alpine
docker pull node:18-alpine
```

### Container memory issues

```bash
# Check current memory usage in Grafana
# Or via command:
docker stats --no-stream
```

---

## 📄 License

[MIT License](LICENSE) - See LICENSE file for details.

---

<p align="center">
  Built with ⚡ for learning production-grade microservices
</p>

<p align="center">
  <a href="http://localhost">App</a> •
  <a href="http://localhost:3001">Grafana</a> •
  <a href="http://localhost:9090">Prometheus</a> •
  <a href="http://localhost:8080">cAdvisor</a>
</p>
