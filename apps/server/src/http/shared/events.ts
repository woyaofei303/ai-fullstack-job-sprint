import type { Response } from "express";

export function writeEvent(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
