"use client";

import { useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { ResourcePage } from "../shared/ui";

export default function Contacts() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<Row[]>("/admin/contacts").then(setRows);
  }, []);
  return (
    <ResourcePage
      title="客户"
      description="网页访客与渠道身份默认独立，需要时由管理员手工合并。"
    >
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>邮箱</th>
              <th>身份数</th>
              <th>备注</th>
              <th>加入时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <strong>{String(row.name || "匿名访客")}</strong>
                </td>
                <td>{String(row.email || "—")}</td>
                <td>{String(row.identities)}</td>
                <td>{String(row.notes || "—")}</td>
                <td>{new Date(String(row.createdAt)).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResourcePage>
  );
}
