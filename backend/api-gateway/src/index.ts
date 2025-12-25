import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';

import { SubmissionRequestSchema, Job } from './types/job';
import { Submission } from './models/Submission';
import { getRedisClient, SUBMISSION_QUEUE, closeRedis } from './services/redis';
import { connectMongo, closeMongo } from './services/mongo';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check endpoint - critical for Docker orchestration
app.get('/health', async (_req: Request, res: Response) => {
  const redis = getRedisClient();
  let redisStatus = 'disconnected';
  let mongoStatus = 'disconnected';

  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'error';
  }

  try {
    if (require('mongoose').connection.readyState === 1) {
      mongoStatus = 'connected';
    }
  } catch {
    mongoStatus = 'error';
  }

  res.status(200).json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: {
      redis: redisStatus,
      mongo: mongoStatus,
    },
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'RCE Engine API Gateway',
    version: '2.0.0',
    endpoints: {
      health: 'GET /health',
      submit: 'POST /submit',
      status: 'GET /status/:jobId',
    },
  });
});

/**
 * POST /submit - Submit code for execution
 *
 * This is the PRODUCER endpoint. It:
 * 1. Validates the request using Zod
 * 2. Creates a job record in MongoDB (status: "queued")
 * 3. Pushes the job to the Redis queue
 * 4. Returns the jobId immediately
 */
app.post('/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Validate request body with Zod
    const validated = SubmissionRequestSchema.parse(req.body);

    // 2. Generate unique job ID
    const jobId = uuidv4();
    const submittedAt = new Date().toISOString();

    // 3. Create the job object (shared structure)
    const job: Job = {
      jobId,
      language: validated.language,
      code: validated.code,
      submittedAt,
    };

    // 4. Store initial job status in MongoDB
    const submission = new Submission({
      ...job,
      status: 'queued',
    });
    await submission.save();

    console.log(`📥 Job ${jobId} created and saved to MongoDB (status: queued)`);

    // 5. Push job to Redis queue
    const redis = getRedisClient();
    await redis.rpush(SUBMISSION_QUEUE, JSON.stringify(job));

    console.log(`📤 Job ${jobId} pushed to Redis queue: ${SUBMISSION_QUEUE}`);

    // 6. Return jobId immediately (async processing)
    res.status(202).json({
      success: true,
      message: 'Code submission accepted',
      jobId,
      status: 'queued',
      submittedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /status/:jobId - Check job status
 */
app.get('/status/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;

    const submission = await Submission.findOne({ jobId });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId,
      });
      return;
    }

    res.json({
      success: true,
      jobId: submission.jobId,
      language: submission.language,
      status: submission.status,
      submittedAt: submission.submittedAt,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
      result: submission.result,
      error: submission.error,
    });
  } catch (error) {
    next(error);
  }
});

// Zod validation error handler
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }
  next(err);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down gracefully...');
  await closeRedis();
  await closeMongo();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function start(): Promise<void> {
  try {
    // Connect to MongoDB first
    await connectMongo();

    // Initialize Redis connection
    getRedisClient();

    app.listen(PORT, () => {
      console.log(`🚀 API Gateway running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 Submit code:  POST http://localhost:${PORT}/submit`);
      console.log(`📍 Check status: GET  http://localhost:${PORT}/status/:jobId`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
