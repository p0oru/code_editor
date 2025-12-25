package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/docker/docker/client"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	serviceName     = "execution-worker"
	version         = "2.0.0"
	submissionQueue = "submission_queue"
)

// Job represents the structure shared with the API Gateway
// This MUST match the TypeScript Job interface exactly
type Job struct {
	JobID       string `json:"jobId" bson:"jobId"`
	Language    string `json:"language" bson:"language"`
	Code        string `json:"code" bson:"code"`
	SubmittedAt string `json:"submittedAt" bson:"submittedAt"`
}

// Global clients
var (
	redisClient *redis.Client
	mongoClient *mongo.Client
	mongoDb     *mongo.Database
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Printf("🚀 %s v%s starting...", serviceName, version)

	// Setup context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize connections
	if err := initConnections(ctx); err != nil {
		log.Fatalf("❌ Failed to initialize connections: %v", err)
	}
	defer cleanup()

	// Verify Docker socket connectivity (optional for code execution)
	if err := verifyDockerConnection(); err != nil {
		log.Printf("⚠️  Docker connection failed: %v", err)
		log.Println("📍 Continuing anyway - Docker socket may not be mounted")
	} else {
		log.Println("✅ Docker daemon connection verified")
	}

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start the worker loop in a goroutine
	go workerLoop(ctx)

	// Wait for shutdown signal
	sig := <-quit
	log.Printf("🛑 Received signal %v, shutting down gracefully...", sig)
	cancel() // Cancel context to stop worker loop
	time.Sleep(1 * time.Second) // Give time for cleanup
	log.Println("👋 Worker shutdown complete")
}

// initConnections establishes connections to Redis and MongoDB
func initConnections(ctx context.Context) error {
	// Redis connection
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379")
	log.Printf("📡 Connecting to Redis at %s", redisURL)

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return err
	}

	redisClient = redis.NewClient(opt)

	// Test Redis connection
	if _, err := redisClient.Ping(ctx).Result(); err != nil {
		return err
	}
	log.Println("✅ Redis connected")

	// MongoDB connection
	mongoURL := getEnv("MONGO_URL", "mongodb://localhost:27017/rce-engine")
	log.Printf("📡 Connecting to MongoDB at %s", mongoURL)

	mongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(mongoURL))
	if err != nil {
		return err
	}

	// Test MongoDB connection
	if err := mongoClient.Ping(ctx, nil); err != nil {
		return err
	}
	log.Println("✅ MongoDB connected")

	// Get database reference
	mongoDb = mongoClient.Database("rce-engine")

	return nil
}

// workerLoop continuously listens for jobs on the Redis queue
func workerLoop(ctx context.Context) {
	log.Printf("👂 Worker listening on queue: %s", submissionQueue)
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Worker loop stopped")
			return
		default:
			// BLPOP: Blocking pop from the left of the list
			// This will block until a message is available or timeout
			result, err := redisClient.BLPop(ctx, 0, submissionQueue).Result()
			if err != nil {
				if err == context.Canceled {
					return
				}
				log.Printf("❌ Redis BLPOP error: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			// result[0] is the queue name, result[1] is the value
			if len(result) < 2 {
				log.Println("⚠️  Empty result from BLPOP")
				continue
			}

			// Process the job
			processJob(ctx, result[1])
		}
	}
}

// processJob handles a single job from the queue
func processJob(ctx context.Context, jobData string) {
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("📨 Received job data: %s", truncate(jobData, 200))

	// 1. Unmarshal the JSON
	var job Job
	if err := json.Unmarshal([]byte(jobData), &job); err != nil {
		log.Printf("❌ Failed to unmarshal job: %v", err)
		return
	}

	log.Printf("⚡ Processing Job [%s] for Language: [%s]", job.JobID, job.Language)
	log.Printf("📝 Code preview: %s", truncate(job.Code, 100))

	// 2. Update MongoDB status to "processing"
	if err := updateJobStatus(ctx, job.JobID, "processing"); err != nil {
		log.Printf("❌ Failed to update status to processing: %v", err)
		return
	}
	log.Printf("📊 Job [%s] status updated to: processing", job.JobID)

	// 3. Simulate work (2 second delay)
	log.Printf("⏳ Simulating code execution (2 seconds)...")
	time.Sleep(2 * time.Second)

	// 4. Update MongoDB status to "completed"
	if err := updateJobStatus(ctx, job.JobID, "completed"); err != nil {
		log.Printf("❌ Failed to update status to completed: %v", err)
		return
	}

	log.Printf("✅ Job [%s] completed successfully!", job.JobID)
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

// updateJobStatus updates the status of a job in MongoDB
func updateJobStatus(ctx context.Context, jobID string, status string) error {
	collection := mongoDb.Collection("submissions")

	update := bson.M{
		"$set": bson.M{
			"status": status,
		},
	}

	// Add timestamp fields based on status
	if status == "processing" {
		update["$set"].(bson.M)["startedAt"] = time.Now().UTC().Format(time.RFC3339)
	} else if status == "completed" || status == "failed" {
		update["$set"].(bson.M)["completedAt"] = time.Now().UTC().Format(time.RFC3339)
	}

	_, err := collection.UpdateOne(
		ctx,
		bson.M{"jobId": jobID},
		update,
	)

	return err
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

	_, err = cli.Ping(ctx)
	if err != nil {
		return err
	}

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

// truncate limits a string to maxLen characters
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// cleanup closes all connections
func cleanup() {
	log.Println("🧹 Cleaning up resources...")

	if redisClient != nil {
		if err := redisClient.Close(); err != nil {
			log.Printf("⚠️  Error closing Redis: %v", err)
		}
	}

	if mongoClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := mongoClient.Disconnect(ctx); err != nil {
			log.Printf("⚠️  Error closing MongoDB: %v", err)
		}
	}
}
