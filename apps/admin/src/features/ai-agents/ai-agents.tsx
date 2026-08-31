"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { errorText, ResourcePage } from "../shared/ui";

export default function AiAgents({ notify }: { notify(value: string): void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [bases, setBases] = useState<Row[]>([]);
  const [debugResult, setDebugResult] = useState<Row>();
  const load = useCallback(
    () =>
      Promise.all([
        api<Row[]>("/admin/ai-agents"),
        api<Row[]>("/admin/knowledge-bases"),
      ]).then(([agents, knowledge]) => {
        setRows(agents);
        setBases(knowledge);
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
      await api("/admin/ai-agents", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          temperature: 0.2,
          language: "auto",
          handoffKeywords: ["人工", "human"],
          knowledgeBaseIds: [data.knowledgeBaseId],
        }),
      });
      form.reset();
      await load();
      notify("AI 角色已创建");
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  async function debug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setDebugResult(
        await api<Row>(`/admin/ai-agents/${values.aiAgentId}/debug`, {
          method: "POST",
          body: JSON.stringify({ question: values.question }),
        }),
      );
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  return (
    <ResourcePage
      title="AI 角色"
      description="定义回答职责、模型、语气与可使用的知识范围。"
    >
      <div className="card-grid">
        {rows.map((row) => (
          <article className="agent-card" key={String(row.id)}>
            <div className="agent-avatar">✦</div>
            <span className="success-dot">
              {row.enabled ? "运行中" : "停用"}
            </span>
            <h3>{String(row.name)}</h3>
            <p>{String(row.description || "严格基于知识库回答")}</p>
            <dl>
              <dt>模型</dt>
              <dd>{String(row.model)}</dd>
              <dt>语言</dt>
              <dd>{String(row.language)}</dd>
            </dl>
          </article>
        ))}
      </div>
      <form className="panel inline-form" onSubmit={debug}>
        <h2>角色调试</h2>
        <label>
          AI 角色
          <select name="aiAgentId" required>
            {rows.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          测试问题
          <input name="question" required placeholder="输入一个客户问题" />
        </label>
        <button type="submit" className="secondary">
          调试回答
        </button>
        {debugResult && (
          <section className="wide">
            <strong>{String(debugResult.answer)}</strong>
            <p>
              有效来源：
              {((debugResult.sourceIds as number[]) || []).join(", ") || "无"}
            </p>
          </section>
        )}
      </form>
      <form className="panel inline-form" onSubmit={submit}>
        <h2>新增 AI 角色</h2>
        <label>
          名称
          <input name="name" required />
        </label>
        <label>
          模型
          <input name="model" defaultValue="gpt-4.1-mini" required />
        </label>
        <label>
          知识库
          <select name="knowledgeBaseId" required>
            {bases.map((base) => (
              <option key={String(base.id)} value={String(base.id)}>
                {String(base.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          职责说明
          <input name="description" />
        </label>
        <label className="wide">
          系统提示词
          <textarea
            name="systemPrompt"
            required
            defaultValue="只能根据知识库回答客户问题，不得编造业务事实。"
          />
        </label>
        <label className="wide">
          兜底回复
          <input
            name="fallbackMessage"
            required
            defaultValue="暂时没有找到可靠答案，已为你转接人工客服。"
          />
        </label>
        <button type="submit" className="primary">
          创建角色
        </button>
      </form>
    </ResourcePage>
  );
}
