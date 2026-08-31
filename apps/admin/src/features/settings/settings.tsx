"use client";

import { type FormEvent, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { errorText, ResourcePage } from "../shared/ui";

export default function Settings({ notify }: { notify(value: string): void }) {
  const [data, setData] = useState<Record<string, Row>>({});
  const [logs, setLogs] = useState<Row[]>([]);
  useEffect(() => {
    api<Record<string, Row>>("/admin/settings").then(setData);
    api<Row[]>("/admin/audit-logs").then(setLogs);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await api("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        general: {
          brandName: values.brandName,
          privacyUrl: values.privacyUrl,
          retentionDays: Number(values.retentionDays),
        },
        ai: {
          baseUrl: values.baseUrl,
          embeddingModel: values.embeddingModel,
          apiKey: values.apiKey,
        },
      }),
    });
    notify("设置已保存");
  }
  return (
    <ResourcePage
      title="设置"
      description="密钥使用 AES-256-GCM 加密，界面不回显明文。"
    >
      <form className="panel settings-form" onSubmit={submit}>
        <section>
          <h2>品牌与隐私</h2>
          <label>
            系统品牌
            <input
              name="brandName"
              defaultValue={String(data.general?.brandName || "Support Desk")}
            />
          </label>
          <label>
            隐私政策 URL
            <input
              name="privacyUrl"
              type="url"
              defaultValue={String(data.general?.privacyUrl || "")}
            />
          </label>
          <label>
            数据保留天数
            <input
              name="retentionDays"
              type="number"
              min="30"
              max="365"
              defaultValue={String(data.general?.retentionDays || 180)}
            />
          </label>
        </section>
        <section>
          <h2>AI 服务</h2>
          <label>
            OpenAI 兼容 Base URL
            <input
              name="baseUrl"
              type="url"
              defaultValue={String(data.ai?.baseUrl || "")}
            />
          </label>
          <label>
            Embedding 模型
            <input
              name="embeddingModel"
              defaultValue={String(data.ai?.embeddingModel || "")}
            />
          </label>
          <label>
            API Key
            <input
              name="apiKey"
              type="password"
              placeholder={
                data.ai?.hasSecret ? "已配置，留空保持不变" : "输入 API Key"
              }
            />
          </label>
        </section>
        <button type="submit" className="primary">
          保存设置
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            api<Row>("/admin/settings/test-ai", { method: "POST" })
              .then((result) =>
                notify(
                  result.ok
                    ? `AI 连接正常 · Embedding ${String(result.embeddingDimensions)} 维`
                    : "AI 连接测试失败",
                ),
              )
              .catch((reason) => notify(errorText(reason)))
          }
        >
          测试 AI 连接
        </button>
      </form>
      <div className="panel table-wrap">
        <header>
          <div>
            <h2>最近审计事件</h2>
            <p>登录、配置、接管与删除操作</p>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>操作</th>
              <th>对象</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 20).map((row) => (
              <tr key={String(row.id)}>
                <td>{new Date(String(row.created_at)).toLocaleString()}</td>
                <td>{String(row.userName || "系统")}</td>
                <td>{String(row.action)}</td>
                <td>{String(row.target_type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResourcePage>
  );
}
