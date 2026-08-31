export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function requiredText(value: unknown, label: string) {
  const result = cleanText(value, 10_000);
  if (!result) throw new Error(`${label}不能为空。`);
  return result;
}

export function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringList(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 50)
    : fallback;
}

export function numberBetween(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

export function allowedLanguage(value: unknown): "auto" | "zh-CN" | "en" {
  return value === "zh-CN" || value === "en" ? value : "auto";
}

export function stripPassword<T extends { passwordHash?: string }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
