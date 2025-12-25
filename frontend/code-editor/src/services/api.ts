// ============================================
// API Service - Handles all backend communication
// ============================================

import type { Language, SubmitResponse, StatusResponse, HealthResponse } from '../types/api';

// Use environment variable or fallback to localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Submit code for execution
 * @param language The programming language
 * @param code The code to execute
 * @returns Promise with job submission response
 */
export async function submitCode(language: Language, code: string): Promise<SubmitResponse> {
  const response = await fetch(`${API_BASE_URL}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ language, code }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check the status of a job
 * @param jobId The job ID to check
 * @returns Promise with job status response
 */
export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE_URL}/status/${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check API health status
 * @returns Promise with health response
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error('API unreachable');
  }

  return response.json();
}

/**
 * Poll for job completion
 * @param jobId The job ID to poll
 * @param onUpdate Callback for status updates
 * @param interval Polling interval in ms (default 1000)
 * @param maxAttempts Maximum polling attempts (default 60)
 * @returns Cleanup function to stop polling
 */
export function pollJobStatus(
  jobId: string,
  onUpdate: (status: StatusResponse) => void,
  onError: (error: Error) => void,
  interval = 1000,
  maxAttempts = 60
): () => void {
  let attempts = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;

    attempts++;

    try {
      const status = await getJobStatus(jobId);
      onUpdate(status);

      // Check if job is complete (terminal states)
      if (['completed', 'failed', 'timeout'].includes(status.status)) {
        return; // Stop polling
      }

      // Check if max attempts reached
      if (attempts >= maxAttempts) {
        onError(new Error('Polling timeout: Job is taking too long'));
        return;
      }

      // Schedule next poll
      timeoutId = setTimeout(poll, interval);
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  // Start polling
  poll();

  // Return cleanup function
  return () => {
    stopped = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

