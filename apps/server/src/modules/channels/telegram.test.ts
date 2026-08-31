import assert from "node:assert/strict";
import test from "node:test";
import { parseTelegramUpdate } from "./telegram.js";

test("Telegram accepts private support messages and ignores groups", () => {
  assert.deepEqual(
    parseTelegramUpdate({
      update_id: 42,
      message: {
        message_id: 9,
        chat: { id: 123, type: "private" },
        from: { id: 123, first_name: "Ada", username: "ada" },
        caption: "broken item",
        photo: [
          { file_id: "small", file_size: 100 },
          { file_id: "large", file_size: 1000 },
        ],
      },
    }),
    {
      updateId: 42,
      platformMessageId: "9",
      externalId: "123",
      name: "Ada",
      username: "ada",
      text: "broken item",
      photoFileId: "large",
    },
  );

  assert.equal(
    parseTelegramUpdate({
      update_id: 43,
      message: {
        message_id: 10,
        chat: { id: -1, type: "group" },
        text: "hello",
      },
    }),
    null,
  );
});
