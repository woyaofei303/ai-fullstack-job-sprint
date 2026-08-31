const TELEGRAM_API = "https://api.telegram.org";

export type TelegramInbound = {
  updateId: number;
  platformMessageId: string;
  externalId: string;
  name: string;
  username?: string;
  text: string;
  photoFileId?: string;
};

type TelegramResult<T> = { ok: boolean; result?: T; description?: string };

export function parseTelegramUpdate(input: unknown): TelegramInbound | null {
  const update = input as {
    update_id?: number;
    message?: {
      message_id?: number;
      chat?: { id?: number; type?: string };
      from?: {
        id?: number;
        first_name?: string;
        last_name?: string;
        username?: string;
      };
      text?: string;
      caption?: string;
      photo?: Array<{ file_id?: string; file_size?: number }>;
    };
  };
  const message = update?.message;
  if (
    typeof update?.update_id !== "number" ||
    message?.chat?.type !== "private" ||
    typeof message.message_id !== "number" ||
    typeof message.from?.id !== "number"
  )
    return null;

  const photo = [...(message.photo ?? [])]
    .filter((item) => item.file_id)
    .sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
  const name = [message.from.first_name, message.from.last_name]
    .filter(Boolean)
    .join(" ");
  return {
    updateId: update.update_id,
    platformMessageId: String(message.message_id),
    externalId: String(message.from.id),
    name: name || message.from.username || String(message.from.id),
    ...(message.from.username ? { username: message.from.username } : {}),
    text: message.text ?? message.caption ?? "",
    ...(photo?.file_id ? { photoFileId: photo.file_id } : {}),
  };
}

async function telegramRequest<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramResult<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(
      payload.description || `Telegram ${method} failed (${response.status})`,
    );
  }
  return payload.result;
}

export async function configureTelegramBot(
  token: string,
  webhookUrl: string,
  secretToken: string,
) {
  const bot = await telegramRequest<{ id: number; username?: string }>(
    token,
    "getMe",
    {},
  );
  await telegramRequest<boolean>(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  return bot;
}

export function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  return telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function sendTelegramTyping(token: string, chatId: string) {
  return telegramRequest<boolean>(token, "sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });
}

export async function downloadTelegramPhoto(token: string, fileId: string) {
  const file = await telegramRequest<{
    file_path?: string;
    file_size?: number;
  }>(token, "getFile", {
    file_id: fileId,
  });
  if (!file.file_path) throw new Error("Telegram photo has no file path");
  if ((file.file_size ?? 0) > 5 * 1024 * 1024)
    throw new Error("Telegram photo exceeds 5 MB");
  const response = await fetch(
    `${TELEGRAM_API}/file/bot${token}/${file.file_path}`,
  );
  if (!response.ok)
    throw new Error(`Telegram photo download failed (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 5 * 1024 * 1024)
    throw new Error("Telegram photo exceeds 5 MB");
  return data;
}
