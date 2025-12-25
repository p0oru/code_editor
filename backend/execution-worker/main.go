package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/docker/docker/client"
)

const (
	serviceName = "execution-worker"
	version     = "1.0.0"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Printf("🚀 %s v%s starting...", serviceName, version)

	// Verify Docker socket connectivity
	if err := verifyDockerConnection(); err != nil {
		log.Printf("⚠️  Docker connection failed: %v", err)
		log.Println("📍 Continuing anyway - Docker socket may not be mounted in development")
	} else {
		log.Println("✅ Docker daemon connection verified")
	}

	// Log environment info
	log.Printf("📍 Redis URL: %s", getEnv("REDIS_URL", "redis://localhost:6379"))
	log.Printf("📍 MongoDB URL: %s", getEnv("MONGO_URL", "mongodb://localhost:27017"))

	log.Println("👂 Worker listening for jobs...")

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Main loop - placeholder for job processing
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			log.Println("💓 Heartbeat - Worker is alive and waiting for jobs")
		case sig := <-quit:
			log.Printf("🛑 Received signal %v, shutting down gracefully...", sig)
			cleanup()
			log.Println("👋 Worker shutdown complete")
			return
		}
	}
}

// verifyDockerConnection checks if we can communicate with the Docker daemon
func verifyDockerConnection() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return err
	}
	defer cli.Close()

	// Ping the Docker daemon
	_, err = cli.Ping(ctx)
	if err != nil {
		return err
	}

	// Get Docker version info
	info, err := cli.Info(ctx)
	if err != nil {
		return err
	}

	log.Printf("🐳 Docker Server Version: %s", info.ServerVersion)
	log.Printf("🐳 Docker Containers: %d running, %d total", info.ContainersRunning, info.Containers)
	
	return nil
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// cleanup performs any necessary cleanup before shutdown
func cleanup() {
	log.Println("🧹 Cleaning up resources...")
	// Future: Close Redis connections, finish pending jobs, etc.
}

