"use client";

import { useEffect, useState } from "react";
import AiAgents from "../ai-agents/ai-agents";
import Login from "../auth/login";
import Channels from "../channels/channels";
import Contacts from "../contacts/contacts";
import Inbox from "../inbox/inbox";
import KnowledgeBases from "../knowledge/knowledge-bases";
import Overview from "../overview/overview";
import Settings from "../settings/settings";
import { api } from "../shared/api";
import type { Tab, User } from "../shared/types";
import { Centered } from "../shared/ui";
import Team from "../team/team";

const navigation: Array<{
  id: Tab;
  label: string;
  glyph: string;
  admin?: boolean;
}> = [
  { id: "overview", label: "概览", glyph: "◫" },
  { id: "inbox", label: "统一收件箱", glyph: "✦" },
  { id: "contacts", label: "客户", glyph: "◎" },
  { id: "ai", label: "AI 角色", glyph: "◇", admin: true },
  { id: "knowledge", label: "知识库", glyph: "▤", admin: true },
  { id: "channels", label: "渠道", glyph: "⌁", admin: true },
  { id: "team", label: "团队", glyph: "♙", admin: true },
  { id: "settings", label: "设置", glyph: "⚙", admin: true },
];

export default function AdminConsole() {
  const [user, setUser] = useState<User | null>();
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api<User>("/admin/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  if (user === undefined)
    return (
      <Centered>
        <span className="loader" role="status" aria-label="加载中" />
      </Centered>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <div className="brand-mark">
          <span>S</span>
          <div>
            <strong>Supportly</strong>
            <small>AI customer care</small>
          </div>
        </div>
        <nav aria-label="后台导航">
          {navigation
            .filter((item) => !item.admin || user.role === "admin")
            .map((item) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                <span aria-hidden>{item.glyph}</span>
                {item.label}
                {item.id === "inbox" && <i>•</i>}
              </button>
            ))}
        </nav>
        <div className="nav-user">
          <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.displayName}</strong>
            <small>{user.role === "admin" ? "管理员" : "客服"}</small>
          </div>
          <button
            type="button"
            aria-label="退出"
            onClick={() =>
              api("/admin/auth/logout", { method: "POST" }).then(() =>
                setUser(null),
              )
            }
          >
            ↗
          </button>
        </div>
      </aside>
      <section className="admin-content">
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button type="button" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {tab === "overview" && <Overview user={user} />}
        {tab === "inbox" && <Inbox user={user} notify={setNotice} />}
        {tab === "contacts" && <Contacts />}
        {tab === "ai" && <AiAgents notify={setNotice} />}
        {tab === "knowledge" && <KnowledgeBases notify={setNotice} />}
        {tab === "channels" && <Channels notify={setNotice} />}
        {tab === "team" && <Team notify={setNotice} />}
        {tab === "settings" && <Settings notify={setNotice} />}
      </section>
    </main>
  );
}
