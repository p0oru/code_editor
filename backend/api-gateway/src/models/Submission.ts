import mongoose, { Schema, Document } from 'mongoose';
import { JobDocument, JobStatuses, SupportedLanguages } from '../types/job';

// Mongoose document interface
export interface ISubmission extends Document, JobDocument {}

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
      enum: JobStatuses,
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
    result: {
      type: String,
    },
    error: {
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

