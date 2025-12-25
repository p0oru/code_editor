import Redis from 'ioredis';

// Redis queue name - shared between Producer (API) and Consumer (Worker)
export const SUBMISSION_QUEUE = 'submission_queue';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log(`📡 Connecting to Redis at ${redisUrl}`);

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
    });

    redisClient.on('close', () => {
      console.log('🔌 Redis connection closed');
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
