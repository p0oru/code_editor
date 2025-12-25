package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	serviceName     = "execution-worker"
	version         = "4.0.0"
	submissionQueue = "submission_queue"
	analysisChannel = "analysis_queue" // Pub/Sub channel for analysis worker
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
	redisClient    *redis.Client
	mongoClient    *mongo.Client
	mongoDb        *mongo.Database
	dockerProvider *DockerProvider
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Printf("🚀 %s v%s starting...", serviceName, version)
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Setup context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize connections
	if err := initConnections(ctx); err != nil {
		log.Fatalf("❌ Failed to initialize connections: %v", err)
	}
	defer cleanup()

	// Initialize Docker provider
	var err error
	dockerProvider, err = NewDockerProvider()
	if err != nil {
		log.Fatalf("❌ Failed to initialize Docker provider: %v", err)
	}
	defer dockerProvider.Close()
	log.Println("✅ Docker provider initialized")
	log.Printf("🐳 Supported languages: %v", GetSupportedLanguages())

	// Ensure execution volume exists
	if err := os.MkdirAll(ExecutionVolume, 0755); err != nil {
		log.Printf("⚠️  Warning: Could not create execution volume at %s: %v", ExecutionVolume, err)
	} else {
		log.Printf("📁 Execution volume ready: %s", ExecutionVolume)
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
	time.Sleep(2 * time.Second) // Give time for cleanup
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
	if err := updateJobStatus(ctx, job.JobID, "processing", nil); err != nil {
		log.Printf("❌ Failed to update status to processing: %v", err)
		return
	}
	log.Printf("📊 Job [%s] status updated to: processing", job.JobID)

	// 3. Execute code in Docker container
	log.Printf("🐳 [%s] Starting Docker execution...", job.JobID)
	result, err := dockerProvider.ExecuteCode(ctx, job.Language, job.Code, job.JobID)
	if err != nil {
		log.Printf("❌ [%s] Docker execution error: %v", job.JobID, err)
		updateJobStatus(ctx, job.JobID, "failed", &ExecutionResult{
			Output: "",
			Error:  err.Error(),
			Status: "failed",
		})
		return
	}

	// 4. Log execution results
	log.Printf("📊 [%s] Execution Result:", job.JobID)
	log.Printf("   Status: %s", result.Status)
	log.Printf("   Exit Code: %d", result.ExitCode)
	log.Printf("   Duration: %v", result.ExecutionTime)
	log.Printf("   Output: %s", truncate(result.Output, 200))
	if result.Error != "" {
		log.Printf("   Error: %s", result.Error)
	}

	// 5. Update MongoDB with final result
	if err := updateJobStatus(ctx, job.JobID, result.Status, result); err != nil {
		log.Printf("❌ Failed to update status to %s: %v", result.Status, err)
		return
	}

	log.Printf("✅ Job [%s] finished with status: %s", job.JobID, result.Status)

	// 6. Notify analysis worker via Redis Pub/Sub
	if err := notifyAnalysisWorker(ctx, job); err != nil {
		log.Printf("⚠️ Failed to notify analysis worker: %v", err)
		// Non-fatal error - execution succeeded
	} else {
		log.Printf("📊 Job [%s] sent to analysis queue", job.JobID)
	}

	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

// notifyAnalysisWorker publishes a message to the analysis queue
// for the Python analysis worker to pick up and analyze
func notifyAnalysisWorker(ctx context.Context, job Job) error {
	// Create the message payload for the analysis worker
	payload := map[string]interface{}{
		"jobId":    job.JobID,
		"language": job.Language,
		"code":     job.Code,
	}

	// Marshal to JSON
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Publish to the analysis channel using Redis Pub/Sub
	return redisClient.Publish(ctx, analysisChannel, string(data)).Err()
}

// updateJobStatus updates the status of a job in MongoDB
func updateJobStatus(ctx context.Context, jobID string, status string, result *ExecutionResult) error {
	collection := mongoDb.Collection("submissions")

	updateFields := bson.M{
		"status": status,
	}

	// Add timestamp fields based on status
	if status == "processing" {
		updateFields["startedAt"] = time.Now().UTC().Format(time.RFC3339)
	} else if status == "completed" || status == "failed" || status == "timeout" {
		updateFields["completedAt"] = time.Now().UTC().Format(time.RFC3339)
		
		// Add execution results if provided
		if result != nil {
			updateFields["output"] = result.Output
			updateFields["executionTime"] = result.ExecutionTime.Milliseconds()
			updateFields["exitCode"] = result.ExitCode
			
			if result.Error != "" {
				updateFields["error"] = result.Error
			}
		}
	}

	update := bson.M{"$set": updateFields}

	_, err := collection.UpdateOne(
		ctx,
		bson.M{"jobId": jobID},
		update,
	)

	return err
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
