import multer from "multer";

export const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  defParamCharset: "utf8",
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  defParamCharset: "utf8",
});
