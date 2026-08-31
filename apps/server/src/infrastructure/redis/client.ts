import { createClient } from "redis";

export function createRedisCache(url: string) {
  const cache = createClient({ url });
  cache.on("error", (error) => console.warn("Redis error:", error.message));
  return cache;
}
