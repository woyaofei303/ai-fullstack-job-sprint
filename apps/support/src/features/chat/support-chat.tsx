"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";

type Entry = {
  publicId: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
};
type Widget = {
  name: string;
  publicId: string;
  agentName: string;
  entries: Entry[];
  brand: { brandName?: string; privacyUrl?: string };
  telegramUsername?: string;
  whatsappAvailable: boolean;
  allowedOrigins: string[];
};
type ChatMessage = {
  id: string;
  sender: "visitor" | "ai" | "agent" | "system";
  text: string;
  createdAt: string;
  attachments?: Array<{ id: string; mimeType: string }>;
};
type Session = { conversationId: string; visitorToken: string; status: string };
type Identification = { externalId?: string; name?: string; email?: string };

const copy = {
  "zh-CN": {
    hello: "你好，需要什么帮助？",
    sub: "选择一个服务入口，我们会立即为你接入合适的 AI 客服。",
    web: "网页在线咨询",
    webSub: "在这里直接开始对话",
    telegram: "Telegram",
    telegramSub: "使用 Telegram Bot 咨询",
    whatsapp: "WhatsApp",
    soon: "即将支持",
    back: "返回",
    start: "开始咨询",
    name: "姓名",
    email: "邮箱",
    optional: "选填",
    privacy: "我已阅读并同意隐私政策",
    input: "输入你的问题…",
    handoff: "转人工",
    send: "发送",
    waiting: "正在等待人工客服",
    online: "AI 客服在线",
    humanOnline: "人工客服在线",
    service: "请选择服务类型",
    closed: "会话已结束",
    newChat: "开始新会话",
    image: "图片",
    error: "暂时无法连接客服，请稍后重试。",
  },
  en: {
    hello: "Hi, how can we help?",
    sub: "Choose a service and we’ll connect you to the right AI assistant.",
    web: "Chat on the web",
    webSub: "Start a conversation here",
    telegram: "Telegram",
    telegramSub: "Continue with our Telegram Bot",
    whatsapp: "WhatsApp",
    soon: "Coming soon",
    back: "Back",
    start: "Start chat",
    name: "Name",
    email: "Email",
    optional: "Optional",
    privacy: "I have read and agree to the privacy policy",
    input: "Type your question…",
    handoff: "Human agent",
    send: "Send",
    waiting: "Waiting for a human agent",
    online: "AI support online",
    humanOnline: "Human support online",
    service: "Choose a service",
    closed: "Conversation closed",
    newChat: "Start a new chat",
    image: "Image",
    error: "Support is temporarily unavailable. Please try again.",
  },
} as const;

export default function SupportChat({
  widgetId,
  initialLocale,
}: {
  widgetId: string;
  initialLocale: "zh-CN" | "en";
}) {
  const [locale, setLocale] = useState(initialLocale);
  const t = copy[locale];
  const [widget, setWidget] = useState<Widget>();
  const [stage, setStage] = useState<
    "channels" | "entries" | "profile" | "chat"
  >("channels");
  const [entry, setEntry] = useState<Entry>();
  const [session, setSession] = useState<Session>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("ai_active");
  const [error, setError] = useState("");
  const [identify, setIdentify] = useState<Identification>({});

  useEffect(() => {
    fetch(`/api/public/widgets/${encodeURIComponent(widgetId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data: Widget) => {
        const parentOrigin = document.referrer
          ? new URL(document.referrer).origin
          : "";
        if (
          window.self !== window.top &&
          data.allowedOrigins.length > 0 &&
          !data.allowedOrigins.includes(parentOrigin)
        ) {
          throw new Error(
            "This website is not allowed to embed the support widget.",
          );
        }
        setWidget(data);
        const saved = localStorage.getItem(`support:${widgetId}`);
        if (saved) {
          const parsed = JSON.parse(saved) as Session;
          setSession(parsed);
          setStatus(parsed.status);
          setStage("chat");
        }
        window.parent.postMessage({ type: "support:ready" }, "*");
      })
      .catch((reason) => setError(errorText(reason) || t.error));
  }, [widgetId, t.error]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === "support:identify")
        setIdentify(event.data.value || {});
      if (event.data?.type === "support:reset") {
        localStorage.removeItem(`support:${widgetId}`);
        localStorage.removeItem(`support-visitor:${widgetId}`);
        location.reload();
      }
    };
    addEventListener("message", listener);
    return () => removeEventListener("message", listener);
  }, [widgetId]);
  const conversationId = session?.conversationId;
  const visitorToken = session?.visitorToken;
  useEffect(() => {
    if (session)
      localStorage.setItem(`support:${widgetId}`, JSON.stringify(session));
  }, [session, widgetId]);
  useEffect(() => {
    if (!conversationId || !visitorToken) return;
    const controller = new AbortController();
    const receive = (event: string, raw: unknown) => {
      const data = raw as {
        messages: ChatMessage[];
        status: string;
        id: string;
        sender: string;
      } & ChatMessage;
      if (event === "snapshot") {
        setMessages(data.messages);
        setStatus(data.status);
      }
      if (event === "message") {
        setMessages((current) =>
          current.some((message) => message.id === data.id)
            ? current
            : [...current, data],
        );
        if (data.sender !== "visitor")
          window.parent.postMessage({ type: "support:unread", count: 1 }, "*");
      }
      if (event === "status") {
        setStatus(data.status);
        setSession((current) =>
          current ? { ...current, status: data.status } : current,
        );
      }
    };
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          await streamEvents(
            { conversationId, visitorToken, status: "" },
            controller.signal,
            receive,
          );
        } catch {
          // Reconnect from the server snapshot; message IDs prevent duplicates.
        }
        if (!controller.signal.aborted)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();
    return () => controller.abort();
  }, [conversationId, visitorToken]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry) return;
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const next = await publicApi<Session>("/public/visitors", {
        method: "POST",
        body: JSON.stringify({
          publicId: widgetId,
          serviceEntryId: entry.publicId,
          name: values.name || identify.name,
          email: values.email || identify.email,
          externalId: identify.externalId,
          visitorToken: localStorage.getItem(`support-visitor:${widgetId}`),
          privacyAccepted: values.privacy === "on",
        }),
      });
      localStorage.setItem(`support:${widgetId}`, JSON.stringify(next));
      localStorage.setItem(`support-visitor:${widgetId}`, next.visitorToken);
      setSession(next);
      setStatus(next.status);
      setStage("chat");
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("clientMessageId", crypto.randomUUID());
    try {
      await publicApi(
        `/public/conversations/${session.conversationId}/messages`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${session.visitorToken}` },
          body: data,
        },
      );
      form.reset();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function handoff() {
    if (!session) return;
    try {
      await publicApi(
        `/public/conversations/${session.conversationId}/handoff`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${session.visitorToken}` },
          body: "{}",
        },
      );
      setStatus("waiting_human");
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  function telegramUrl(selected?: Entry) {
    return `https://t.me/${widget?.telegramUsername}${selected ? `?start=${encodeURIComponent(selected.publicId)}` : ""}`;
  }

  if (!widget)
    return (
      <main className="support-page">
        <div className="support-loading">
          {error || <span className="loader" />}
        </div>
      </main>
    );
  return (
    <main className="support-page">
      <section className="support-window">
        <header className="support-header">
          <div className="support-agent">S</div>
          <div>
            <strong>{widget.brand.brandName || widget.name}</strong>
            <small>
              <i />{" "}
              {status === "waiting_human"
                ? t.waiting
                : status === "human_active"
                  ? t.humanOnline
                  : status === "closed"
                    ? t.closed
                    : t.online}
            </small>
          </div>
          <button
            type="button"
            onClick={() =>
              setLocale((value) => (value === "en" ? "zh-CN" : "en"))
            }
          >
            {locale === "en" ? "中" : "EN"}
          </button>
        </header>
        {stage === "channels" && (
          <div className="support-home">
            <p className="eyebrow">CUSTOMER CARE</p>
            <h1>{t.hello}</h1>
            <p>{t.sub}</p>
            <div className="support-options">
              <button type="button" onClick={() => setStage("entries")}>
                <span className="support-option web">⌁</span>
                <div>
                  <strong>{t.web}</strong>
                  <small>{t.webSub}</small>
                </div>
                <b>→</b>
              </button>
              {widget.telegramUsername && (
                <a href={telegramUrl()} target="_blank" rel="noreferrer">
                  <span className="support-option telegram">T</span>
                  <div>
                    <strong>{t.telegram}</strong>
                    <small>{t.telegramSub}</small>
                  </div>
                  <b>↗</b>
                </a>
              )}
              <button type="button" disabled>
                <span className="support-option whatsapp">W</span>
                <div>
                  <strong>{t.whatsapp}</strong>
                  <small>{t.soon}</small>
                </div>
                <em>{t.soon}</em>
              </button>
            </div>
          </div>
        )}
        {stage === "entries" && (
          <div className="support-home">
            <button
              type="button"
              className="support-back"
              onClick={() => setStage("channels")}
            >
              ← {t.back}
            </button>
            <h1>{t.service}</h1>
            <div className="entry-list">
              {widget.entries.map((item) => (
                <button
                  type="button"
                  key={item.publicId}
                  onClick={() => {
                    setEntry(item);
                    setStage("profile");
                  }}
                >
                  <span>✦</span>
                  <div>
                    <strong>
                      {locale === "en" ? item.labelEn : item.labelZh}
                    </strong>
                    <small>
                      {locale === "en"
                        ? item.descriptionEn
                        : item.descriptionZh}
                    </small>
                  </div>
                  <b>→</b>
                </button>
              ))}
            </div>
          </div>
        )}
        {stage === "profile" && (
          <form className="support-profile" onSubmit={start}>
            <button
              type="button"
              className="support-back"
              onClick={() => setStage("entries")}
            >
              ← {t.back}
            </button>
            <div className="support-agent large">✦</div>
            <h1>{locale === "en" ? entry?.labelEn : entry?.labelZh}</h1>
            <label>
              {t.name} <small>{t.optional}</small>
              <input name="name" defaultValue={identify.name} />
            </label>
            <label>
              {t.email} <small>{t.optional}</small>
              <input name="email" type="email" defaultValue={identify.email} />
            </label>
            <label className="privacy-check">
              <input name="privacy" type="checkbox" required />
              <span>
                {t.privacy}
                {widget.brand.privacyUrl && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={widget.brand.privacyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {locale === "en" ? "Privacy policy" : "隐私政策"}
                    </a>
                  </>
                )}
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="primary">
              {t.start}
            </button>
          </form>
        )}
        {stage === "chat" && session && (
          <div className="visitor-chat">
            <div className="visitor-messages" aria-live="polite">
              {messages.length === 0 && (
                <div className="chat-welcome">
                  <div className="support-agent large">✦</div>
                  <h2>{t.hello}</h2>
                  <p>{t.input}</p>
                </div>
              )}
              {messages.map((message) => (
                <div
                  className={`visitor-message ${message.sender}`}
                  key={message.id}
                >
                  {message.attachments?.map((attachment) => (
                    <SecureImage
                      key={attachment.id}
                      session={session}
                      attachment={attachment}
                    />
                  ))}
                  {message.text && <p>{message.text}</p>}
                  <time>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              <div
                ref={(node) => node?.scrollIntoView({ behavior: "smooth" })}
              />
            </div>
            {error && <div className="chat-error">{error}</div>}
            <div className="visitor-tools">
              {status === "closed" ? (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(`support:${widgetId}`);
                    setSession(undefined);
                    setMessages([]);
                    setStatus("ai_active");
                    setStage("channels");
                  }}
                >
                  ↻ {t.newChat}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handoff}
                  disabled={status !== "ai_active"}
                >
                  ♙{" "}
                  {status === "waiting_human"
                    ? t.waiting
                    : status === "human_active"
                      ? t.humanOnline
                      : t.handoff}
                </button>
              )}
            </div>
            <form className="visitor-composer" onSubmit={send}>
              <label aria-label={t.image}>
                ＋
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={status === "closed"}
                />
              </label>
              <textarea
                name="text"
                aria-label={t.input}
                placeholder={t.input}
                disabled={status === "closed"}
              />
              <button
                type="submit"
                className="primary"
                aria-label={t.send}
                disabled={status === "closed"}
              >
                ↑
              </button>
            </form>
          </div>
        )}
      </section>
      <footer>
        Powered by <strong>Supportly</strong>
      </footer>
    </main>
  );
}

function SecureImage({
  session,
  attachment,
}: {
  session: Session;
  attachment: { id: string; mimeType: string };
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    fetch(
      `/api/public/conversations/${session.conversationId}/attachments/${attachment.id}`,
      { headers: { authorization: `Bearer ${session.visitorToken}` } },
    )
      .then((response) => response.blob())
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, attachment.id]);
  return src ? (
    <Image
      unoptimized
      src={src}
      alt="Customer upload"
      width={220}
      height={220}
    />
  ) : null;
}

async function publicApi<T = unknown>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return response.json();
}
async function streamEvents(
  session: Session,
  signal: AbortSignal,
  receive: (event: string, data: unknown) => void,
) {
  const response = await fetch(
    `/api/public/conversations/${session.conversationId}/events`,
    { headers: { authorization: `Bearer ${session.visitorToken}` }, signal },
  );
  if (!response.ok || !response.body) throw new Error("SSE unavailable");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (event && data) receive(event, JSON.parse(data));
    }
  }
}
function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : "Request failed";
}
