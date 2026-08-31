"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { errorText, ResourcePage } from "../shared/ui";

export default function Team({ notify }: { notify(value: string): void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const load = useCallback(() => api<Row[]>("/admin/users").then(setRows), []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      await load();
      notify("成员已创建");
    } catch (reason) {
      notify(errorText(reason));
    }
  }
  return (
    <ResourcePage title="团队" description="MVP 固定管理员与客服两个权限级别。">
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <strong>{String(row.displayName)}</strong>
                </td>
                <td>{String(row.email)}</td>
                <td>{row.role === "admin" ? "管理员" : "客服"}</td>
                <td>
                  <span className="success-dot">
                    {row.enabled ? "启用" : "停用"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="panel inline-form" onSubmit={submit}>
        <h2>新增成员</h2>
        <label>
          姓名
          <input name="displayName" required />
        </label>
        <label>
          邮箱
          <input name="email" type="email" required />
        </label>
        <label>
          角色
          <select name="role">
            <option value="agent">客服</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <label>
          初始密码
          <input name="password" type="password" minLength={10} required />
        </label>
        <button type="submit" className="primary">
          创建账号
        </button>
      </form>
    </ResourcePage>
  );
}
