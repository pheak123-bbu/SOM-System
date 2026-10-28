import IORedis from "ioredis";

// In-memory fallback sliding window cache
interface MemoryBucket {
  count: number;
  resetAt: number;
}
const memoryCache = new Map<string, MemoryBucket>();

let redisClient: IORedis | null = null;
let redisFailed = false;

function getRedis(): IORedis | null {
  if (redisFailed) return null;
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    redisFailed = true;
    return null;
  }

  try {
    redisClient = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on("error", (err) => {
      console.warn("[RateLimiter] Redis connection warning, using memory fallback:", err.message);
    });
    return redisClient;
  } catch {
    redisFailed = true;
    return null;
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch timestamp in seconds
}

/**
 * Checks and increments rate limit for a given key using Redis (atomic MULTI/INCR/EXPIRE)
 * with automatic, seamless fallback to in-memory sliding window.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const reset = now + windowSeconds;
  const redis = getRedis();

  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;
      const pipeline = redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);
      const results = await pipeline.exec();

      if (results && results[0] && !results[0][0]) {
        const count = results[0][1] as number;
        const ttl = (results[1]?.[1] as number) || -1;

        if (ttl === -1) {
          // Set TTL on newly created key
          await redis.expire(redisKey, windowSeconds).catch(() => null);
        }

        const remaining = Math.max(0, limit - count);
        const actualReset = ttl > 0 ? now + ttl : reset;

        return {
          success: count <= limit,
          limit,
          remaining,
          reset: actualReset,
        };
      }
    } catch {
      // Redis error; seamlessly fall back to memory
    }
  }

  // --- In-Memory Sliding Window Fallback ---
  const current = memoryCache.get(key);
  if (!current || now >= current.resetAt) {
    memoryCache.set(key, { count: 1, resetAt: reset });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset,
    };
  }

  current.count += 1;
  const remaining = Math.max(0, limit - current.count);
  return {
    success: current.count <= limit,
    limit,
    remaining,
    reset: current.resetAt,
  };
}

/**
 * Helper to extract client IP from request headers
 */
export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",");
    return parts[0].trim();
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  return "127.0.0.1";
}
