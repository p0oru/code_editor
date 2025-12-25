import mongoose, { Schema, Document } from 'mongoose';
import { JobDocument, JobStatuses, SupportedLanguages } from '../types/job';

// Analysis report interface
export interface IAnalysisReport {
  score: number;
  complexity: string;
  language: string;
  metrics: Record<string, number>;
  risks: Array<{
    type: string;
    message: string;
    level: string;
    line: number;
  }>;
  suggestions: string[];
  analysisTimeMs?: number;
}

// Extended interface with execution result fields
export interface ISubmission extends Document, JobDocument {
  output?: string;
  executionTime?: number;
  exitCode?: number;
  analysisReport?: IAnalysisReport;
  analyzedAt?: string;
}

const SubmissionSchema = new Schema<ISubmission>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    language: {
      type: String,
      required: true,
      enum: SupportedLanguages,
    },
    code: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: [...JobStatuses, 'timeout'], // Include timeout status
      default: 'queued',
    },
    submittedAt: {
      type: String,
      required: true,
    },
    startedAt: {
      type: String,
    },
    completedAt: {
      type: String,
    },
    // Execution results
    output: {
      type: String,
    },
    executionTime: {
      type: Number, // in milliseconds
    },
    exitCode: {
      type: Number,
    },
    result: {
      type: String,
    },
    error: {
      type: String,
    },
    // Analysis results (from Python analysis worker)
    analysisReport: {
      type: Schema.Types.Mixed, // Flexible schema for analysis report
    },
    analyzedAt: {
      type: String,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Index for efficient status queries
SubmissionSchema.index({ status: 1, submittedAt: -1 });

export const Submission = mongoose.model<ISubmission>('Submission', SubmissionSchema);
