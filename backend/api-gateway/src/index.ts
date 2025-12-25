import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint - critical for Docker orchestration
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'RCE Engine API Gateway',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      submissions: '/api/submissions (coming soon)',
    },
  });
});

// Placeholder for future submission endpoint
app.post('/api/submissions', (_req: Request, res: Response) => {
  res.status(501).json({
    message: 'Submission endpoint - Not implemented yet',
    hint: 'Stage 1 is infrastructure only',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

