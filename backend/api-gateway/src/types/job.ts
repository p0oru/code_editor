import { z } from 'zod';

/**
 * Shared Job Schema - This defines the contract between API Gateway and Worker
 * Both services must agree on this structure.
 */

// Supported languages for code execution
export const SupportedLanguages = ['python', 'javascript', 'cpp'] as const;
export type SupportedLanguage = (typeof SupportedLanguages)[number];

// Zod schema for validating incoming submission requests
export const SubmissionRequestSchema = z.object({
  language: z.enum(SupportedLanguages, {
    errorMap: () => ({
      message: `Language must be one of: ${SupportedLanguages.join(', ')}`,
    }),
  }),
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .max(50000, 'Code exceeds maximum length of 50,000 characters'),
});

export type SubmissionRequest = z.infer<typeof SubmissionRequestSchema>;

// Job status lifecycle
export const JobStatuses = ['queued', 'processing', 'completed', 'failed'] as const;
export type JobStatus = (typeof JobStatuses)[number];

// The full Job structure that gets pushed to Redis
export interface Job {
  jobId: string;
  language: SupportedLanguage;
  code: string;
  submittedAt: string; // ISO 8601 timestamp
}

// MongoDB document structure (extends Job with status tracking)
export interface JobDocument extends Job {
  status: JobStatus;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

