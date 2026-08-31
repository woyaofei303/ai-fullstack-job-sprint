import type { ReactNode } from "react";

export function Centered({ children }: { children: ReactNode }) {
  return <main className="centered">{children}</main>;
}
export function ResourcePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="page-pad">
      <PageTitle eyebrow="配置管理" title={title} description={description} />
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty">
      <span>✦</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function statusLabel(status: string) {
  return (
    (
      {
        ai_active: "AI 接待",
        waiting_human: "待人工",
        human_active: "人工处理中",
        closed: "已结束",
      } as Record<string, string>
    )[status] || status
  );
}
export function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : "操作失败";
}
