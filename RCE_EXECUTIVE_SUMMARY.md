# 📋 Executive Summary
## RCE Engine - Remote Code Execution Platform

**Document Version:** 1.0  
**Date:** December 2025  
**Project Status:** ✅ Production-Ready

---

## 🎯 Executive Overview

The **RCE Engine** is a production-grade platform for securely executing user-submitted code in isolated Docker containers. Built with modern microservices architecture, it demonstrates enterprise-level patterns for handling untrusted code while maintaining robust security, observability, and scalability.

### Business Value

| Metric | Value |
|--------|-------|
| **Time to Execute** | < 5 seconds per submission |
| **Languages Supported** | Python 3.9, JavaScript (Node 18) |
| **Concurrent Capacity** | Horizontally scalable workers |
| **Security Isolation** | Multi-layer container hardening |
| **Monitoring Coverage** | 100% container observability |

---

## 🏛 Architecture Summary

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RCE ENGINE - PRODUCTION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   USER → [NGINX:80] → ┬─ / ─────────→ [REACT FRONTEND]                      │
│                       │                                                      │
│                       └─ /api/* ────→ [NODE.JS API GATEWAY]                 │
│                                              │                               │
│                                              ▼                               │
│                                        [REDIS QUEUE]                         │
│                                              │                               │
│                           ┌──────────────────┼──────────────────┐           │
│                           ▼                  │                  ▼           │
│                    [GO EXECUTION         [MONGODB]      [PYTHON ANALYSIS    │
│                       WORKER]                              WORKER]          │
│                           │                                    │           │
│                           ▼                                    │           │
│                    ┌──────────────┐                            │           │
│                    │  EPHEMERAL   │◄───── Pub/Sub ─────────────┘           │
│                    │  SANDBOXES   │                                         │
│                    │  (per job)   │                                         │
│                    └──────────────┘                                         │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              OBSERVABILITY: cAdvisor → Prometheus → Grafana          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Gateway** | Nginx Alpine | Reverse proxy, rate limiting, SSL termination |
| **Frontend** | React 18 + Vite + TypeScript | Monaco code editor, real-time polling UI |
| **API** | Node.js 22 + Express + TypeScript | REST API, job submission, validation |
| **Queue** | Redis 7 | Job queue (producer/consumer pattern) |
| **Execution** | Go 1.23 + Docker SDK | Ephemeral container orchestration |
| **Analysis** | Python 3.9 + FastAPI | Static code analysis via AST/regex |
| **Database** | MongoDB 7 | Persistent storage for jobs & results |
| **Metrics** | Prometheus + cAdvisor | Real-time container metrics |
| **Visualization** | Grafana | Dashboards and alerting |

---

## 🔄 Data Flow Pipeline

### Request Lifecycle

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          CODE EXECUTION PIPELINE                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SUBMIT          2. QUEUE           3. PROCESS        4. EXECUTE        │
│  ────────          ───────            ──────────        ──────────        │
│  User submits      Job pushed to      Go worker         Ephemeral          │
│  code via API      Redis BRPOP        pops job          container spawns   │
│         │               │                  │                 │              │
│         ▼               ▼                  ▼                 ▼              │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │  Nginx   │───▶│   API    │─────▶│  Redis   │─────▶│  Worker  │         │
│  │  :80     │    │ Gateway  │      │  Queue   │      │   (Go)   │         │
│  └──────────┘    └──────────┘      └──────────┘      └────┬─────┘         │
│                        │                                   │               │
│                        │ Store initial                     │ Docker SDK    │
│                        ▼ status                            ▼               │
│                  ┌──────────┐                       ┌──────────────┐       │
│                  │ MongoDB  │◀────────────────────│   Sandbox     │       │
│                  │ (status) │     Update result    │  Container   │       │
│                  └──────────┘                       └──────────────┘       │
│                                                            │               │
│  5. ANALYZE         6. STORE          7. RESPOND                          │
│  ──────────        ───────           ──────────                           │
│  Python worker     Update MongoDB    Frontend polls                        │
│  via Pub/Sub       with analysis     for completion                        │
│         │               │                  │                               │
│         ▼               ▼                  ▼                               │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐                          │
│  │ Analysis │───▶│ MongoDB  │◀─────│ Frontend │                          │
│  │  Worker  │    │ (final)  │      │ Polling  │                          │
│  └──────────┘    └──────────┘      └──────────┘                          │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Processing Stages

| Stage | Component | Action | Duration |
|-------|-----------|--------|----------|
| 1 | **Nginx** | Route request to API Gateway | ~1ms |
| 2 | **API Gateway** | Validate, create job, push to Redis | ~5ms |
| 3 | **Redis** | Hold job in queue until worker pops | Variable |
| 4 | **Execution Worker** | Write code to volume, spawn container | ~100ms |
| 5 | **Sandbox** | Execute code with resource limits | ≤5000ms |
| 6 | **Analysis Worker** | AST/regex analysis on code | ~50ms |
| 7 | **MongoDB** | Store final result with analysis | ~10ms |

---

## 🔒 Security Architecture

### Defense-in-Depth Model

The platform implements **12 security layers** to protect against malicious code:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Layer 1: NETWORK ISOLATION                                            │
│   ├── NetworkDisabled: true (no internet, no internal network)          │
│   └── Each sandbox is completely network-isolated                       │
│                                                                          │
│   Layer 2: RESOURCE LIMITS                                              │
│   ├── Memory: 128MB hard limit (no swap)                                │
│   ├── CPU: 0.5 cores (50% of one CPU)                                   │
│   ├── PIDs: Max 50 processes (prevents fork bombs)                      │
│   └── Disk: Read-only code mount                                        │
│                                                                          │
│   Layer 3: EXECUTION TIMEOUT                                            │
│   └── 5 second hard timeout (container killed after)                    │
│                                                                          │
│   Layer 4: CAPABILITY DROPPING                                          │
│   ├── All Linux capabilities dropped                                    │
│   ├── No setuid/setgid execution                                        │
│   └── SecurityOpt: no-new-privileges                                    │
│                                                                          │
│   Layer 5: EPHEMERAL CONTAINERS                                         │
│   ├── AutoRemove: true (deleted immediately after execution)            │
│   ├── No persistent state between executions                            │
│   └── Fresh environment for every job                                   │
│                                                                          │
│   Layer 6: NON-ROOT EXECUTION                                           │
│   ├── API Gateway runs as non-root user                                 │
│   ├── Analysis Worker runs as non-root user                             │
│   └── Sandbox containers use minimal Alpine images                      │
│                                                                          │
│   Layer 7: STATIC CODE ANALYSIS                                         │
│   ├── Python: AST-based analysis for dangerous patterns                 │
│   ├── JavaScript: Regex pattern matching                                │
│   └── Detects: eval, exec, os.system, child_process, etc.              │
│                                                                          │
│   Layer 8: INPUT VALIDATION                                             │
│   ├── API validates language parameter                                  │
│   ├── Code size limits                                                  │
│   └── Request rate limiting via Nginx                                   │
│                                                                          │
│   Layer 9: IMAGE SECURITY                                               │
│   ├── Alpine-based minimal images                                       │
│   ├── No shell access in production                                     │
│   └── Pre-pulled trusted images only                                    │
│                                                                          │
│   Layer 10: VOLUME ISOLATION                                            │
│   ├── Named volume for code transfer only                               │
│   ├── Job-specific subdirectories                                       │
│   └── Worker cleans up after execution                                  │
│                                                                          │
│   Layer 11: DOCKER SOCKET PROTECTION                                    │
│   ├── Only execution-worker has socket access                           │
│   ├── Worker validates all container parameters                         │
│   └── Strict container naming convention                                │
│                                                                          │
│   Layer 12: OBSERVABILITY                                               │
│   ├── All container metrics tracked                                     │
│   ├── Abnormal resource usage alerting                                  │
│   └── Audit trail via MongoDB                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Security Configuration (Go Execution Worker)

```go
// Container security configuration
HostConfig: &container.HostConfig{
    NetworkMode:   "none",              // Complete network isolation
    AutoRemove:    true,                // Ephemeral - auto-cleanup
    Resources: container.Resources{
        Memory:     128 * 1024 * 1024,  // 128MB hard limit
        MemorySwap: 128 * 1024 * 1024,  // No swap
        CPUQuota:   50000,              // 50% CPU
        CPUPeriod:  100000,
        PidsLimit:  &pidsLimit,         // 50 PIDs max
    },
    SecurityOpt: []string{
        "no-new-privileges",            // Prevent privilege escalation
    },
    CapDrop: []string{"ALL"},           // Drop all capabilities
}
```

### Static Analysis Detection (Python)

| Category | Detected Patterns | Risk Level |
|----------|------------------|------------|
| **Code Injection** | `eval()`, `exec()`, `compile()` | 🔴 Critical |
| **System Commands** | `os.system()`, `subprocess.*` | 🔴 Critical |
| **Network Access** | `socket.*`, `requests.*`, `urllib.*` | 🟠 High |
| **File Operations** | `shutil.rmtree()`, `os.remove()` | 🟠 High |
| **Dynamic Imports** | `__import__()` | 🟠 High |
| **Serialization** | `pickle.load()`, `pickle.loads()` | 🟡 Medium |
| **Infinite Loops** | `while True:` | 🟡 Medium |
| **Blocking Input** | `input()` | 🟢 Low |

---

## 📊 Observability Stack

### Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐                                                       │
│   │   cAdvisor   │  Container Metrics Exporter                          │
│   │    :8080     │  • CPU usage per container                           │
│   │              │  • Memory consumption                                 │
│   │              │  • Network I/O                                        │
│   │              │  • Filesystem stats                                   │
│   └──────┬───────┘                                                       │
│          │ scrape every 15s                                             │
│          ▼                                                               │
│   ┌──────────────┐                                                       │
│   │  Prometheus  │  Time-Series Database                                │
│   │    :9090     │  • Stores 7 days of metrics                          │
│   │              │  • PromQL query language                              │
│   │              │  • Alert rule evaluation                              │
│   └──────┬───────┘                                                       │
│          │ data source                                                   │
│          ▼                                                               │
│   ┌──────────────┐                                                       │
│   │   Grafana    │  Visualization & Dashboards                          │
│   │    :3001     │  • Pre-configured RCE Engine dashboard               │
│   │              │  • Real-time CPU/Memory graphs                        │
│   │              │  • Service health status                              │
│   │              │  • Network traffic analysis                           │
│   └──────────────┘                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dashboard Panels

| Panel | Description | Key Metrics |
|-------|-------------|-------------|
| **🔥 CPU Usage** | Per-container CPU utilization | `rate(container_cpu_usage_seconds_total[1m])` |
| **💾 Memory Usage** | Memory consumption with trends | `container_memory_usage_bytes` |
| **⚡ Execution Worker CPU** | Gauge showing worker load | Threshold: 50% yellow, 80% red |
| **⚡ Execution Worker Memory** | Gauge with memory thresholds | Max: 512MB configured |
| **🌐 Network I/O** | Ingress/egress traffic | `container_network_*_bytes_total` |
| **📊 Service Status** | Up/down indicators | `up{job="..."}` |
| **🐳 Running Containers** | Active container count | `count(container_last_seen)` |
| **Total Memory/Network** | Aggregate stats | `sum(...)` aggregations |

### Key Observability Benefits

1. **Ephemeral Container Visibility**: Execution containers exist for seconds - metrics capture their resource usage before deletion
2. **Security Monitoring**: Detect anomalous CPU/memory spikes indicating attack attempts
3. **Performance Optimization**: Identify bottlenecks in execution pipeline
4. **Capacity Planning**: Historical data for scaling decisions
5. **Debugging**: Correlate failures with resource exhaustion

---

## 🐳 Service Inventory

### Application Services (10 Total)

| Service | Technology | Port | Resources | Health Check |
|---------|------------|------|-----------|--------------|
| **nginx** | Nginx Alpine | 80 | - | `nginx -t` |
| **frontend** | React + Vite | 5173 (internal) | - | - |
| **api-gateway** | Node.js 22 | 3000 (internal) | 512MB / 1 CPU | `/health` endpoint |
| **execution-worker** | Go 1.23 | - | 256MB / 1 CPU | Process check |
| **analysis-worker** | Python 3.9 | 8000 (internal) | 256MB / 0.5 CPU | `/health` endpoint |
| **redis** | Redis 7 Alpine | 6379 (internal) | 300MB / 0.5 CPU | `redis-cli ping` |
| **mongo** | MongoDB 7 | 27017 (internal) | 512MB / 1 CPU | `mongosh ping` |
| **prometheus** | Prometheus | 9090 | 512MB / 0.5 CPU | `/-/healthy` |
| **grafana** | Grafana | 3001 | 256MB / 0.5 CPU | `/api/health` |
| **cadvisor** | cAdvisor | 8080 | 256MB / 0.5 CPU | - |

### Ephemeral Execution Containers

| Language | Docker Image | Memory | CPU | Timeout | Network |
|----------|-------------|--------|-----|---------|---------|
| Python | `python:3.9-alpine` | 128MB | 50% | 5s | Disabled |
| JavaScript | `node:18-alpine` | 128MB | 50% | 5s | Disabled |

---

## 📁 Project Structure

```
code_executor/
│
├── backend/
│   ├── api-gateway/           # Node.js REST API
│   │   ├── src/
│   │   │   ├── index.ts       # Express server
│   │   │   ├── models/        # MongoDB schemas
│   │   │   ├── services/      # Redis, MongoDB clients
│   │   │   └── types/         # TypeScript interfaces
│   │   ├── Dockerfile         # Multi-stage build
│   │   └── package.json
│   │
│   ├── execution-worker/      # Go execution engine
│   │   ├── main.go            # Worker entry point
│   │   ├── docker_provider.go # Container orchestration
│   │   ├── Dockerfile
│   │   └── go.mod
│   │
│   └── analysis-worker/       # Python static analyzer
│       ├── main.py            # FastAPI + Redis subscriber
│       ├── analyzer.py        # AST/regex analysis
│       ├── requirements.txt
│       └── Dockerfile
│
├── frontend/
│   └── code-editor/           # React application
│       ├── src/
│       │   ├── components/    # UI components
│       │   │   ├── CodeEditor.tsx    # Monaco editor
│       │   │   ├── Terminal.tsx      # Output display
│       │   │   ├── AnalysisPanel.tsx # Security report
│       │   │   └── Workspace.tsx     # Main container
│       │   └── services/
│       │       └── api.ts     # API client with polling
│       ├── Dockerfile
│       └── vite.config.ts
│
├── infrastructure/
│   ├── nginx/
│   │   └── nginx.conf         # Reverse proxy config
│   ├── prometheus/
│   │   └── prometheus.yml     # Scrape configuration
│   └── grafana/
│       └── provisioning/      # Auto-configured dashboards
│
├── test-scripts/              # PowerShell test suite
├── docker-compose.yml         # Full orchestration
├── Makefile                   # Development commands
└── README.md                  # Documentation
```

---

## 🗺 Development Roadmap

### Completed Stages ✅

| Stage | Name | Key Deliverables |
|-------|------|------------------|
| **1** | Infrastructure | Docker Compose, network config, service boilerplates |
| **2** | Queue Integration | Redis producer/consumer, MongoDB tracking |
| **3** | Code Execution | Docker SDK, ephemeral containers, resource limits |
| **4** | Static Analysis | Python AST analyzer, JavaScript regex patterns |
| **5** | Frontend Dashboard | Monaco editor, real-time polling, Tailwind UI |
| **6** | Production Infrastructure | Nginx gateway, Prometheus, Grafana, hardening |

### Future Enhancements (Roadmap)

| Priority | Enhancement | Description |
|----------|-------------|-------------|
| 🔴 High | **WebSocket Integration** | Replace polling with real-time updates |
| 🔴 High | **Language Expansion** | Add Go, Rust, Java, C++ support |
| 🟠 Medium | **Kubernetes Deployment** | Helm charts for K8s orchestration |
| 🟠 Medium | **Authentication** | OAuth2/JWT user authentication |
| 🟡 Low | **Code Sharing** | Shareable execution URLs |
| 🟡 Low | **Execution History** | User-based submission history |

---

## 🔧 Operations Guide

### Starting the Platform

```bash
# Clone repository
git clone <repository-url>
cd code_executor

# Build and start all services
docker compose up --build -d

# Pre-pull execution images (first time only)
docker pull python:3.9-alpine
docker pull node:18-alpine

# Verify all services are healthy
docker compose ps
```

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Application** | http://localhost | - |
| **Grafana** | http://localhost:3001 | admin / rceadmin |
| **Prometheus** | http://localhost:9090 | - |
| **cAdvisor** | http://localhost:8080 | - |

### Common Operations

```bash
# View logs for a specific service
docker compose logs -f execution-worker

# Restart a service
docker compose restart api-gateway

# Stop all services
docker compose down

# Full cleanup (removes data)
docker compose down -v
```

---

## 📈 Performance Characteristics

### Throughput Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Avg Execution Time** | 200-500ms | Excluding image pull |
| **Max Execution Time** | 5000ms | Hard timeout |
| **Concurrent Executions** | Limited by CPU/memory | Scale workers horizontally |
| **Queue Processing** | ~100 jobs/min/worker | Dependent on code complexity |

### Resource Usage (Baseline)

| Service | CPU (idle) | Memory | Notes |
|---------|------------|--------|-------|
| Nginx | <1% | ~5MB | Minimal footprint |
| API Gateway | 1-2% | 35MB | Node.js baseline |
| Execution Worker | <1% | 5MB | Go efficiency |
| Analysis Worker | <1% | 48MB | Python + libraries |
| Redis | <1% | 9MB | In-memory store |
| MongoDB | 5-10% | 120MB | Database operations |
| Prometheus | <1% | 75MB | Time-series storage |
| Grafana | 1-2% | 85MB | Dashboard rendering |
| cAdvisor | 5-7% | 115MB | Metrics collection |

---

## 🎓 Key Technical Decisions

### Why This Architecture?

| Decision | Rationale |
|----------|-----------|
| **Sibling Containers** | Execution worker spawns containers via Docker socket, avoiding nested containerization complexity |
| **Go for Execution** | Performance-critical; direct Docker SDK access; minimal memory footprint |
| **Python for Analysis** | AST module provides robust Python parsing; rapid prototyping for analysis logic |
| **Node.js for API** | Async I/O for handling concurrent requests; rich npm ecosystem |
| **Redis for Queue** | BRPOP for reliable job consumption; Pub/Sub for analysis pipeline |
| **MongoDB for Storage** | Flexible schema for varying code/results; good for document storage |
| **Nginx as Gateway** | Battle-tested reverse proxy; single entry point; SSL termination ready |
| **Prometheus + Grafana** | Industry-standard observability; extensive Docker/container support |

### Trade-offs Acknowledged

| Trade-off | Decision | Mitigation |
|-----------|----------|------------|
| Polling vs WebSocket | Polling for simplicity | WebSocket planned for v2 |
| Single Worker | One execution worker | Kubernetes scaling planned |
| Docker Socket Access | Required for sibling containers | Strict container config; monitoring |
| Windows cAdvisor Labels | Different label format | Dashboard queries adjusted |

---

## 📄 Conclusion

The RCE Engine represents a complete, production-ready solution for secure remote code execution. Key achievements include:

1. **✅ Multi-Layer Security**: 12 distinct security mechanisms protect against malicious code
2. **✅ Modern Architecture**: Microservices with clear separation of concerns
3. **✅ Full Observability**: Real-time metrics, dashboards, and alerting capability
4. **✅ Developer Experience**: Hot-reload frontend, comprehensive logging, easy debugging
5. **✅ Production Patterns**: Health checks, resource limits, graceful degradation

The platform is ready for deployment and can serve as a foundation for:
- Online coding education platforms
- Technical interview systems
- Code playground applications
- CI/CD pipeline integrations

---

<p align="center">
  <strong>RCE Engine v1.0</strong><br>
  Built with ⚡ for secure, scalable code execution
</p>

<p align="center">
  <a href="http://localhost">Application</a> •
  <a href="http://localhost:3001">Grafana</a> •
  <a href="http://localhost:9090">Prometheus</a>
</p>

