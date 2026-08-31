"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { errorText, ResourcePage } from "../shared/ui";

export default function Channels({ notify }: { notify(value: string): void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<Row[]>([]);
  const load = useCallback(
    () =>
      Promise.all([
        api<Row[]>("/admin/channels"),
        api<Row[]>("/admin/ai-agents"),
      ]).then(([channels, ai]) => {
        setRows(channels);
        setAgents(ai);
      }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await api("/admin/channels", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          allowedOrigins: String(data.allowedOrigins || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      form.reset();
      await load();
      notify("渠道已创建");
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  return (
    <ResourcePage
      title="渠道"
      description="统一处理网页与 Telegram；WhatsApp 在后续版本开放。"
    >
      <div className="channel-grid">
        {rows.map((row) => (
          <article className="channel-card" key={String(row.id)}>
            <span className={`channel-logo ${row.type}`}>
              {row.type === "telegram" ? "T" : "W"}
            </span>
            <div>
              <h3>{String(row.name)}</h3>
              <p>
                {row.type === "web"
                  ? `/support/${String(row.publicId)}`
                  : `@${String((row.config as Row)?.botUsername || "")}`}
              </p>
              <small>
                {(row.entries as unknown[])?.length || 0} 个服务入口
              </small>
            </div>
            <span className="success-dot">
              {row.enabled ? "已启用" : "已停用"}
            </span>
          </article>
        ))}
        <article className="channel-card muted">
          <span className="channel-logo whatsapp">W</span>
          <div>
            <h3>WhatsApp Business</h3>
            <p>Cloud API 集成</p>
            <small>后续路线</small>
          </div>
          <span className="pending-dot">即将支持</span>
        </article>
      </div>
      <form className="panel inline-form" onSubmit={submit}>
        <h2>连接新渠道</h2>
        <label>
          类型
          <select name="type">
            <option value="web">网页聊天</option>
            <option value="telegram">Telegram Bot</option>
          </select>
        </label>
        <label>
          名称
          <input name="name" required />
        </label>
        <label>
          默认 AI
          <select name="defaultAiAgentId" required>
            {agents.map((agent) => (
              <option key={String(agent.id)} value={String(agent.id)}>
                {String(agent.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          允许嵌入域名（逗号分隔）
          <input name="allowedOrigins" placeholder="https://shop.example.com" />
        </label>
        <label className="wide">
          Telegram Bot Token（仅 Telegram）
          <input name="token" type="password" autoComplete="off" />
        </label>
        <button type="submit" className="primary">
          连接渠道
        </button>
      </form>
    </ResourcePage>
  );
}
