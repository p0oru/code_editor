# ⚡ RCE Engine - Remote Code Execution Platform

A LeetCode-style platform for executing user-submitted code safely in isolated Docker containers.

![Stage](https://img.shields.io/badge/Stage-1%20Infrastructure-blue)
![Docker](https://img.shields.io/badge/Docker-Compose%20V2-2496ED?logo=docker)
![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)
![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)

---

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Services](#-services)
- [Development](#-development)
- [Git Strategy](#-git-strategy)
- [Stage Roadmap](#-stage-roadmap)

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RCE Engine Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐   │
│   │   Frontend  │ ──────► │ API Gateway │ ──────► │    Redis    │   │
│   │  (React)    │         │  (Node.js)  │         │   (Queue)   │   │
│   │  Port 5173  │         │  Port 3000  │         │  Port 6379  │   │
│   └─────────────┘         └─────────────┘         └──────┬──────┘   │
│                                  │                        │          │
│                                  │                        ▼          │
│                                  │                ┌─────────────┐   │
│                                  │                │   Worker    │   │
│                                  │                │    (Go)     │   │
│                                  │                └──────┬──────┘   │
│                                  │                       │          │
│                                  ▼                       ▼          │
│                           ┌─────────────┐      ┌─────────────────┐  │
│                           │   MongoDB   │      │  Docker Socket  │  │
│                           │  Port 27017 │      │ (Host Daemon)   │  │
│                           └─────────────┘      └────────┬────────┘  │
│                                                         │           │
│                                                         ▼           │
│                                                ┌────────────────┐   │
│                                                │ Sibling        │   │
│                                                │ Containers     │   │
│                                                │ (User Code)    │   │
│                                                └────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** submits code via the **Frontend**
2. **API Gateway** validates and queues the job in **Redis**
3. **Execution Worker** pulls jobs and spawns isolated **sibling containers**
4. Results are stored in **MongoDB** and returned to the user

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

# Or with logs visible
docker compose up --build
```

### 3. Verify Services

```bash
# Check all containers are running
docker compose ps

# Test API Gateway health
curl http://localhost:3000/health

# Open frontend
# Navigate to http://localhost:5173
```

### 4. Verify Docker Socket Access

```bash
# Confirm worker can access Docker
docker exec -it rce-execution-worker ls -la /var/run/docker.sock

# Check worker logs
docker compose logs execution-worker
```

---

## 📁 Project Structure

```
code_executor/
├── backend/
│   ├── api-gateway/          # Node.js + Express + TypeScript
│   │   ├── src/
│   │   │   └── index.ts      # Express server with /health
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── execution-worker/     # Go worker service
│       ├── main.go           # Worker entry point
│       ├── Dockerfile
│       └── go.mod
│
├── frontend/
│   └── code-editor/          # React + Vite + TypeScript
│       ├── src/
│       ├── Dockerfile
│       ├── package.json
│       └── vite.config.ts
│
├── infrastructure/           # Docker & deployment configs
│   └── sandbox/              # Sandboxed execution environments
│       └── Dockerfile.python # Python sandbox (Stage 2)
│
├── docker-compose.yml        # Orchestration configuration
├── .gitignore               # Comprehensive ignore rules
└── README.md                # This file
```

---

## 🐳 Services

| Service | Technology | Port | Purpose |
|---------|------------|------|---------|
| `frontend` | React + Vite | 5173 | Code editor UI |
| `api-gateway` | Node.js + Express | 3000 | REST API, validation |
| `execution-worker` | Go | - | Code execution via Docker |
| `redis` | Redis 7 | 6379 | Job queue |
| `mongo` | MongoDB 7 | 27017 | Persistent storage |

### Service Commands

```bash
# View logs for specific service
docker compose logs -f api-gateway

# Restart a service
docker compose restart execution-worker

# Stop all services
docker compose down

# Stop and remove volumes (reset data)
docker compose down -v
```

---

## 💻 Development

### Local Development (Without Docker)

#### API Gateway

```bash
cd backend/api-gateway
npm install
npm run dev
```

#### Frontend

```bash
cd frontend/code-editor
npm install
npm run dev
```

#### Go Worker

```bash
cd backend/execution-worker
go mod download
go run main.go
```

### Hot Reload

- **Frontend**: Automatically enabled via Vite
- **API Gateway**: Use `npm run dev` with tsx watch
- **Worker**: Rebuild container or use Air for Go hot reload

---

## 📝 Git Strategy

### Trunk-Based Development

We follow a simplified trunk-based development model:

- **`main`** - Production-ready code
- **Feature branches** - Short-lived branches for features/fixes

### Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

#### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding tests |
| `chore` | Maintenance tasks |
| `ci` | CI/CD changes |

#### Examples

```bash
feat(api): add code submission endpoint
fix(worker): handle timeout in code execution
docs(readme): update architecture diagram
chore(docker): upgrade base images to alpine 3.20
```

---

## 🗺 Stage Roadmap

### Stage 1: Infrastructure ✅ (Current)

- [x] Monorepo structure
- [x] Docker Compose orchestration
- [x] Service boilerplates
- [x] Network configuration
- [x] Volume persistence

### Stage 2: Core Execution (Next)

- [ ] Redis job queue integration
- [ ] Go worker job processing
- [ ] Sandbox container spawning
- [ ] Python execution support
- [ ] Result storage in MongoDB

### Stage 3: API & Frontend

- [ ] Submission REST API
- [ ] Monaco code editor integration
- [ ] Real-time execution feedback
- [ ] Submission history

### Stage 4: Production Hardening

- [ ] Rate limiting
- [ ] Authentication
- [ ] Resource limits on sandboxes
- [ ] Kubernetes deployment

---

## 🔒 Security Considerations

> ⚠️ **Warning**: The execution worker has access to the Docker socket, which is essentially root access to the host machine. This is intentional for the sibling container pattern but requires careful handling in production.

### Current (Development)

- Docker socket mounted directly
- No authentication
- All ports exposed on localhost

### Production Recommendations

- Use Docker-in-Docker (DinD) or rootless Docker
- Implement JWT authentication
- Use reverse proxy (Nginx/Traefik)
- Enable MongoDB authentication
- Limit container resources (CPU, memory, network)
- Implement network policies

---

## 📄 License

[MIT License](LICENSE) - See LICENSE file for details.

---

<p align="center">
  Built with ⚡ for learning and experimentation
</p>

