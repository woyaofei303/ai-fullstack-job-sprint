import crypto from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function detectImageType(
  bytes: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function saveImage(bytes: Buffer, mediaDir: string) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("图片大小必须在 1 B–5 MB 之间。");
  const mimeType = detectImageType(bytes);
  if (!mimeType) throw new Error("仅支持有效的 PNG、JPEG 或 WebP 图片。");
  await mkdir(mediaDir, { recursive: true, mode: 0o700 });
  const extension = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  }[mimeType];
  const storagePath = `${crypto.randomUUID()}${extension}`;
  await writeFile(path.join(mediaDir, storagePath), bytes, { mode: 0o600 });
  return { storagePath, mimeType, size: bytes.length };
}

export function readImage(mediaDir: string, storagePath: string) {
  return readFile(path.join(mediaDir, path.basename(storagePath)));
}

export async function removeImage(mediaDir: string, storagePath: string) {
  await unlink(path.join(mediaDir, path.basename(storagePath))).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
}
