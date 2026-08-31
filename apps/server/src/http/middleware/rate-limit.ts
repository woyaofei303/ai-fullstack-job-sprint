import type { RequestHandler } from "express";

type RateLimitCache = {
  isReady: boolean;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export function createRateLimiter(cache: RateLimitCache): RequestHandler {
  return async (request, response, next) => {
    if (!cache.isReady) return next();
    const key = `rate:public:${request.ip}`;
    const count = await cache.incr(key);
    if (count === 1) await cache.expire(key, 60);
    if (count > 90) {
      response.status(429).json({ error: "请求过于频繁，请稍后重试。" });
      return;
    }
    next();
  };
}
