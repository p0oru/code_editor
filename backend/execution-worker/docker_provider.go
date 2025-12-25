package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// ============================================
// Docker Provider - Secure Code Execution
// ============================================
// This module handles ephemeral container spawning for
// secure, isolated code execution with strict resource limits.
//
// ARCHITECTURE NOTE - Sibling Containers:
// The execution worker runs inside a Docker container and spawns
// "sibling" containers on the host's Docker daemon (via socket mount).
// Both containers share a named Docker volume for code file transfer:
//   - Worker writes to: /tmp/executions/<jobId>/script.py
//   - Volume name: rce-executions
//   - Sibling mounts same volume at: /code
//   - Sibling executes: python3 /code/<jobId>/script.py
// ============================================

// LanguageConfig defines execution parameters for each language
type LanguageConfig struct {
	Image     string // Docker image to use
	Extension string // File extension for code files
	Executor  string // Command/binary to execute the code
	Timeout   time.Duration
}

// ExecutionResult contains the output from code execution
type ExecutionResult struct {
	Output        string        // Combined stdout/stderr
	ExitCode      int           // Container exit code
	ExecutionTime time.Duration // How long execution took
	Status        string        // "completed", "failed", "timeout"
	Error         string        // Error message if any
}

// Resource limits for security
const (
	MemoryLimit         int64 = 128 * 1024 * 1024 // 128 MB
	MemorySwap          int64 = 128 * 1024 * 1024 // No swap (same as memory)
	CPUQuota            int64 = 50000             // 50% of one CPU (100000 = 1 CPU)
	CPUPeriod           int64 = 100000            // Standard CPU period
	DefaultTimeout            = 5 * time.Second   // Max execution time
	ExecutionVolume           = "/tmp/executions" // Path inside worker container
	ExecutionVolumeName       = "rce-executions"  // Docker named volume
)

// languageMap maps supported languages to their configurations
var languageMap = map[string]LanguageConfig{
	"python": {
		Image:     "python:3.9-alpine",
		Extension: ".py",
		Executor:  "python3",
		Timeout:   DefaultTimeout,
	},
	"javascript": {
		Image:     "node:18-alpine",
		Extension: ".js",
		Executor:  "node",
		Timeout:   DefaultTimeout,
	},
}

// DockerProvider handles container-based code execution
type DockerProvider struct {
	client *client.Client
}

// NewDockerProvider creates a new Docker provider instance
func NewDockerProvider() (*DockerProvider, error) {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = cli.Ping(ctx)
	if err != nil {
		cli.Close()
		return nil, fmt.Errorf("failed to connect to Docker daemon: %w", err)
	}

	return &DockerProvider{client: cli}, nil
}

// Close releases Docker client resources
func (dp *DockerProvider) Close() error {
	if dp.client != nil {
		return dp.client.Close()
	}
	return nil
}

// ExecuteCode runs user code in an isolated Docker container
func (dp *DockerProvider) ExecuteCode(ctx context.Context, language, code, jobID string) (*ExecutionResult, error) {
	startTime := time.Now()

	// 1. Validate language
	langConfig, ok := languageMap[language]
	if !ok {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("unsupported language: %s", language),
		}, nil
	}

	log.Printf("🐳 [%s] Executing %s code with image: %s", jobID, language, langConfig.Image)

	// 2. Create execution context with timeout
	execCtx, cancel := context.WithTimeout(ctx, langConfig.Timeout)
	defer cancel()

	// 3. Ensure the Docker image exists (pull if needed)
	if err := dp.ensureImage(execCtx, langConfig.Image); err != nil {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("failed to pull image: %v", err),
		}, nil
	}

	// 4. Create temporary directory for code within the shared volume
	// This path is inside the worker container, backed by the named volume
	execDir := filepath.Join(ExecutionVolume, jobID)
	if err := os.MkdirAll(execDir, 0755); err != nil {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("failed to create execution directory: %v", err),
		}, nil
	}
	defer func() {
		// Cleanup: remove the execution directory after completion
		if err := os.RemoveAll(execDir); err != nil {
			log.Printf("⚠️  [%s] Failed to cleanup execution directory: %v", jobID, err)
		}
	}()

	// 5. Write code to file
	codeFileName := "script" + langConfig.Extension
	codeFile := filepath.Join(execDir, codeFileName)
	if err := os.WriteFile(codeFile, []byte(code), 0644); err != nil {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("failed to write code file: %v", err),
		}, nil
	}

	log.Printf("📝 [%s] Code written to: %s", jobID, codeFile)

	// 6. Build the command to execute
	// The sibling container mounts the volume at /code, so the script is at /code/<jobId>/script.py
	scriptPath := fmt.Sprintf("/code/%s/%s", jobID, codeFileName)
	executeCmd := []string{langConfig.Executor, scriptPath}

	// 7. Create container with strict security constraints
	containerConfig := &container.Config{
		Image:           langConfig.Image,
		Cmd:             executeCmd,
		WorkingDir:      "/code",
		NetworkDisabled: true,      // SECURITY: No network access
		User:            "nobody",  // SECURITY: Run as non-root
		Env: []string{
			"HOME=/tmp",
			"PYTHONDONTWRITEBYTECODE=1",
			"NODE_ENV=production",
		},
		// Don't attach stdin
		AttachStdin:  false,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          false,
	}

	hostConfig := &container.HostConfig{
		// SECURITY: Resource limits
		Resources: container.Resources{
			Memory:     MemoryLimit,  // 128MB max memory
			MemorySwap: MemorySwap,   // No swap
			CPUQuota:   CPUQuota,     // 0.5 CPU cores
			CPUPeriod:  CPUPeriod,
			PidsLimit:  int64Ptr(50), // Limit number of processes
		},
		// SECURITY: Additional restrictions
		ReadonlyRootfs: false,                        // Some languages need /tmp writes
		AutoRemove:     false,                        // We'll remove manually after getting logs
		SecurityOpt:    []string{"no-new-privileges"},
		CapDrop:        []string{"ALL"},             // Drop all capabilities
		
		// Mount the shared volume
		// Both worker and sibling containers access the same named volume
		Mounts: []mount.Mount{
			{
				Type:     mount.TypeVolume,
				Source:   ExecutionVolumeName, // Named Docker volume
				Target:   "/code",              // Where it appears in the container
				ReadOnly: true,                 // Code is read-only inside execution container
			},
		},
	}

	containerName := fmt.Sprintf("rce-exec-%s", jobID)

	// 8. Create the container
	log.Printf("🏗️  [%s] Creating container: %s", jobID, containerName)
	resp, err := dp.client.ContainerCreate(
		execCtx,
		containerConfig,
		hostConfig,
		nil, // NetworkingConfig
		nil, // Platform
		containerName,
	)
	if err != nil {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("failed to create container: %v", err),
		}, nil
	}

	containerID := resp.ID
	log.Printf("📦 [%s] Container created: %s", jobID, containerID[:12])

	// Ensure cleanup happens even if we panic
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		dp.removeContainer(cleanupCtx, containerID, jobID)
	}()

	// 9. Start the container
	log.Printf("▶️  [%s] Starting container...", jobID)
	if err := dp.client.ContainerStart(execCtx, containerID, container.StartOptions{}); err != nil {
		return &ExecutionResult{
			Output:        "",
			ExitCode:      1,
			ExecutionTime: time.Since(startTime),
			Status:        "failed",
			Error:         fmt.Sprintf("failed to start container: %v", err),
		}, nil
	}

	// 10. Wait for container to finish (with timeout)
	log.Printf("⏳ [%s] Waiting for execution (timeout: %v)...", jobID, langConfig.Timeout)
	statusCh, errCh := dp.client.ContainerWait(execCtx, containerID, container.WaitConditionNotRunning)

	var exitCode int64
	var execStatus string
	var execError string

	select {
	case err := <-errCh:
		if err != nil {
			// Check if it's a timeout
			if execCtx.Err() == context.DeadlineExceeded {
				log.Printf("⏰ [%s] TIMEOUT - Killing container", jobID)
				// Force kill the container
				killCtx, killCancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer killCancel()
				dp.client.ContainerKill(killCtx, containerID, "SIGKILL")

				return &ExecutionResult{
					Output:        "Execution timed out. Your code took too long to execute.",
					ExitCode:      124, // Standard timeout exit code
					ExecutionTime: time.Since(startTime),
					Status:        "timeout",
					Error:         fmt.Sprintf("execution exceeded %v limit", langConfig.Timeout),
				}, nil
			}
			execStatus = "failed"
			execError = fmt.Sprintf("container wait error: %v", err)
			exitCode = 1
		}
	case status := <-statusCh:
		exitCode = status.StatusCode
		if exitCode == 0 {
			execStatus = "completed"
		} else {
			execStatus = "failed"
			if status.Error != nil {
				execError = status.Error.Message
			}
		}
	case <-execCtx.Done():
		log.Printf("⏰ [%s] Context deadline exceeded - Killing container", jobID)
		killCtx, killCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer killCancel()
		dp.client.ContainerKill(killCtx, containerID, "SIGKILL")

		return &ExecutionResult{
			Output:        "Execution timed out. Your code took too long to execute.",
			ExitCode:      124,
			ExecutionTime: time.Since(startTime),
			Status:        "timeout",
			Error:         fmt.Sprintf("execution exceeded %v limit", langConfig.Timeout),
		}, nil
	}

	log.Printf("✅ [%s] Container finished with exit code: %d", jobID, exitCode)

	// 11. Capture logs (stdout + stderr)
	output, logErr := dp.getContainerLogs(containerID, jobID)
	if logErr != nil {
		log.Printf("⚠️  [%s] Failed to get logs: %v", jobID, logErr)
		if execError == "" {
			execError = fmt.Sprintf("failed to retrieve output: %v", logErr)
		}
	}

	executionTime := time.Since(startTime)
	log.Printf("⏱️  [%s] Total execution time: %v", jobID, executionTime)

	return &ExecutionResult{
		Output:        output,
		ExitCode:      int(exitCode),
		ExecutionTime: executionTime,
		Status:        execStatus,
		Error:         execError,
	}, nil
}

// ensureImage pulls the Docker image if it doesn't exist locally
func (dp *DockerProvider) ensureImage(ctx context.Context, imageName string) error {
	// Check if image exists locally
	_, _, err := dp.client.ImageInspectWithRaw(ctx, imageName)
	if err == nil {
		// Image exists locally
		return nil
	}

	log.Printf("📥 Pulling image: %s", imageName)

	reader, err := dp.client.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull image %s: %w", imageName, err)
	}
	defer reader.Close()

	// Consume the pull output (required to complete the pull)
	_, err = io.Copy(io.Discard, reader)
	if err != nil {
		return fmt.Errorf("error reading pull output: %w", err)
	}

	log.Printf("✅ Image pulled successfully: %s", imageName)
	return nil
}

// getContainerLogs retrieves stdout and stderr from a container
func (dp *DockerProvider) getContainerLogs(containerID, jobID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     false,
		Timestamps: false,
	}

	logs, err := dp.client.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return "", fmt.Errorf("failed to get container logs: %w", err)
	}
	defer logs.Close()

	// Docker multiplexes stdout and stderr in the log stream
	// We need to demux them using stdcopy
	var stdout, stderr bytes.Buffer
	_, err = stdcopy.StdCopy(&stdout, &stderr, logs)
	if err != nil {
		// Fallback: just read everything
		logs.Close()
		logs, _ = dp.client.ContainerLogs(ctx, containerID, options)
		if logs != nil {
			var buf bytes.Buffer
			io.Copy(&buf, logs)
			return buf.String(), nil
		}
		return "", fmt.Errorf("failed to read container logs: %w", err)
	}

	// Combine stdout and stderr
	output := stdout.String()
	if stderr.Len() > 0 {
		if output != "" && !strings.HasSuffix(output, "\n") {
			output += "\n"
		}
		output += stderr.String()
	}

	// Trim trailing whitespace
	output = strings.TrimRight(output, "\n\r\t ")

	return output, nil
}

// removeContainer forcefully removes a container
func (dp *DockerProvider) removeContainer(ctx context.Context, containerID, jobID string) {
	log.Printf("🧹 [%s] Removing container: %s", jobID, containerID[:12])

	err := dp.client.ContainerRemove(ctx, containerID, container.RemoveOptions{
		Force:         true, // Force removal even if running
		RemoveVolumes: true, // Remove associated volumes
	})
	if err != nil {
		log.Printf("⚠️  [%s] Failed to remove container: %v", jobID, err)
	} else {
		log.Printf("✅ [%s] Container removed successfully", jobID)
	}
}

// GetSupportedLanguages returns a list of supported languages
func GetSupportedLanguages() []string {
	languages := make([]string, 0, len(languageMap))
	for lang := range languageMap {
		languages = append(languages, lang)
	}
	return languages
}

// IsLanguageSupported checks if a language is supported
func IsLanguageSupported(language string) bool {
	_, ok := languageMap[language]
	return ok
}

// Helper function for int64 pointers
func int64Ptr(i int64) *int64 {
	return &i
}
