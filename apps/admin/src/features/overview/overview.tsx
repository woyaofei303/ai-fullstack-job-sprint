"use client";

import { useEffect, useState } from "react";
import { api } from "../shared/api";
import type { User } from "../shared/types";
import { PageTitle } from "../shared/ui";

export default function Overview({ user }: { user: User }) {
  const [data, setData] = useState<Record<string, number>>();
  useEffect(() => {
    api<Record<string, number>>("/admin/dashboard?days=7").then(setData);
  }, []);
  const cards: Array<[string, string | number, string]> = [
    ["会话总量", data?.conversations ?? 0, "近 7 天"],
    [
      "AI 独立解决",
      data?.aiResolved ?? 0,
      `${data?.conversations ? Math.round((data.aiResolved / data.conversations) * 100) : 0}%`,
    ],
    ["转人工", data?.handoffs ?? 0, "需要协作"],
    ["首次响应", `${data?.firstResponseSeconds ?? 0}s`, "平均"],
  ];
  return (
    <div className="page-pad">
      <PageTitle
        eyebrow="实时工作台"
        title={`你好，${user.displayName}`}
        description="查看 AI 与人工客服的服务状态。"
      >
        <select aria-label="统计周期">
          <option>最近 7 天</option>
        </select>
      </PageTitle>
      <div className="metric-grid">
        {cards.map(([label, value, hint], index) => (
          <article key={label}>
            <span className={`metric-icon tone-${index}`}>
              {["↗", "✦", "⇄", "◷"][index]}
            </span>
            <p>{label}</p>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <article className="panel chart-panel">
          <header>
            <div>
              <h2>会话趋势</h2>
              <p>访客需求与服务状态</p>
            </div>
            <span className="success-dot">服务正常</span>
          </header>
          <div className="fake-chart" role="img" aria-label="会话趋势示意图">
            {[36, 62, 48, 80, 55, 74, 93].map((height) => (
              <i key={height} style={{ height: `${height}%` }} />
            ))}
          </div>
        </article>
        <article className="panel queue-panel">
          <header>
            <div>
              <h2>待人工处理</h2>
              <p>共享队列</p>
            </div>
          </header>
          <strong>{data?.waiting ?? 0}</strong>
          <p>位客户正在等待</p>
          <button type="button" className="secondary">
            前往收件箱 →
          </button>
        </article>
      </div>
    </div>
  );
}
