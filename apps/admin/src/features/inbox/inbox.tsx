"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Conversation, Message, Row, User } from "../shared/types";
import { Empty, errorText, statusLabel } from "../shared/ui";

export default function Inbox({
  user,
  notify,
}: {
  user: User;
  notify(value: string): void;
}) {
  const [filter, setFilter] = useState("waiting_human");
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<{
    conversation: Row;
    messages: Message[];
  }>();
  const load = useCallback(async () => {
    const suffix =
      filter === "mine"
        ? "?mine=true"
        : filter === "all"
          ? ""
          : `?status=${filter}`;
    const rows = await api<Conversation[]>(`/admin/conversations${suffix}`);
    setItems(rows);
    setSelected((current) => current ?? rows[0]?.id);
  }, [filter]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (selected)
      api<typeof detail>(`/admin/conversations/${selected}`).then(setDetail);
  }, [selected]);
  async function action(name: "claim" | "resume-ai" | "close") {
    if (!selected) return;
    try {
      await api(`/admin/conversations/${selected}/${name}`, { method: "POST" });
      notify(name === "claim" ? "会话已领取" : "会话状态已更新");
      await load();
      setDetail(await api(`/admin/conversations/${selected}`));
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    try {
      await api(`/admin/conversations/${selected}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: new FormData(form).get("text") }),
      });
      form.reset();
      setDetail(await api(`/admin/conversations/${selected}`));
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  const conversation = detail?.conversation;
  return (
    <div className="inbox-layout">
      <aside className="queue-rail">
        <h1>收件箱</h1>
        <p>会话队列</p>
        {[
          ["waiting_human", "待人工"],
          ["ai_active", "AI 接待"],
          ["mine", "我的会话"],
          ["all", "全部"],
          ["closed", "已结束"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => {
              setFilter(id);
              setSelected(undefined);
            }}
          >
            {label}
            <span>{id === "waiting_human" ? items.length : ""}</span>
          </button>
        ))}
      </aside>
      <section className="conversation-list">
        <header>
          <div>
            <h2>{filter === "waiting_human" ? "待人工队列" : "会话"}</h2>
            <small>{items.length} 个会话</small>
          </div>
          <button type="button" onClick={load} aria-label="刷新">
            ↻
          </button>
        </header>
        <div className="searchbox">
          ⌕ <input aria-label="搜索会话" placeholder="搜索客户或消息" />
        </div>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={
              selected === item.id ? "conversation active" : "conversation"
            }
            onClick={() => setSelected(item.id)}
          >
            <span className={`channel-badge ${item.channelType}`}>
              {item.channelType === "telegram" ? "T" : "W"}
            </span>
            <div>
              <strong>{item.contactName}</strong>
              <p>{item.preview || "暂无消息"}</p>
              <small>
                {item.channelName} · {item.aiAgentName}
              </small>
            </div>
            <time>
              {new Date(item.lastMessageAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </button>
        ))}
      </section>
      <section className="chat-panel">
        {selected && conversation ? (
          <>
            <header>
              <div className="contact-avatar">
                {String(conversation.contactName || "?").slice(0, 1)}
              </div>
              <div>
                <h2>{String(conversation.contactName)}</h2>
                <p>
                  <span className="online-dot" />{" "}
                  {String(conversation.channelName)}
                </p>
              </div>
              <div className="chat-actions">
                {conversation.status === "waiting_human" && (
                  <button
                    type="button"
                    className="primary small"
                    onClick={() => action("claim")}
                  >
                    领取会话
                  </button>
                )}
                <button type="button" onClick={() => action("resume-ai")}>
                  恢复 AI
                </button>
                <button type="button" onClick={() => action("close")}>
                  结束
                </button>
              </div>
            </header>
            <div className="messages" aria-live="polite">
              {detail?.messages.map((message) => (
                <div key={message.id} className={`message ${message.sender}`}>
                  <small>
                    {message.sender === "visitor"
                      ? String(conversation.contactName)
                      : message.sender === "agent"
                        ? message.senderName || user.displayName
                        : message.sender === "ai"
                          ? "AI 客服"
                          : "系统"}
                  </small>
                  <p>{message.text}</p>
                  <time>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
            <form className="reply-box" onSubmit={reply}>
              <textarea
                name="text"
                aria-label="回复内容"
                placeholder={
                  conversation.status === "human_active"
                    ? "输入回复"
                    : "领取会话后可回复"
                }
                disabled={conversation.status !== "human_active"}
                required
              />
              <button
                type="submit"
                className="primary"
                disabled={conversation.status !== "human_active"}
              >
                发送
              </button>
            </form>
          </>
        ) : (
          <Empty
            title="选择一个会话"
            description="从左侧队列开始处理客户问题。"
          />
        )}
      </section>
      <aside className="customer-panel">
        {conversation ? (
          <>
            <p className="eyebrow">客户信息</p>
            <div className="profile-avatar">
              {String(conversation.contactName || "?").slice(0, 1)}
            </div>
            <h3>{String(conversation.contactName)}</h3>
            <p>{String(conversation.contactEmail || "未提供邮箱")}</p>
            <dl>
              <dt>状态</dt>
              <dd>{statusLabel(String(conversation.status))}</dd>
              <dt>负责人</dt>
              <dd>{String(conversation.assignedName || "未分配")}</dd>
              <dt>转人工原因</dt>
              <dd>{String(conversation.handoff_reason || "—")}</dd>
            </dl>
          </>
        ) : null}
      </aside>
    </div>
  );
}
