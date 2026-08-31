"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../shared/api";
import type { Row } from "../shared/types";
import { ResourcePage } from "../shared/ui";

export default function KnowledgeBases({
  notify,
}: {
  notify(value: string): void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [documents, setDocuments] = useState<Row[]>([]);
  const load = useCallback(
    () =>
      api<Row[]>("/admin/knowledge-bases").then((data) => {
        setRows(data);
        setSelected((value) => value || String(data[0]?.id || ""));
      }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selected)
      api<Row[]>(`/admin/knowledge-bases/${selected}/documents`).then(
        setDocuments,
      );
  }, [selected]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api("/admin/knowledge-bases", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    form.reset();
    await load();
    notify("知识库已创建");
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api(`/admin/knowledge-bases/${selected}/documents`, {
      method: "POST",
      body: new FormData(form),
    });
    form.reset();
    setDocuments(await api(`/admin/knowledge-bases/${selected}/documents`));
    notify("文件已上传并进入索引任务");
  }
  async function faq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api(`/admin/knowledge-bases/${selected}/faqs`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    form.reset();
    setDocuments(await api(`/admin/knowledge-bases/${selected}/documents`));
    notify("FAQ 已添加");
  }
  return (
    <ResourcePage
      title="知识库"
      description="文件与 FAQ 向量化到 Qdrant；PostgreSQL 保存业务原文。"
    >
      <div className="knowledge-layout">
        <aside className="panel kb-list">
          <h2>知识库</h2>
          {rows.map((row) => (
            <button
              type="button"
              key={String(row.id)}
              className={selected === row.id ? "active" : ""}
              onClick={() => setSelected(String(row.id))}
            >
              <strong>{String(row.name)}</strong>
              <small>
                {String(row.documents)} 文档 · {String(row.chunks)} 分块
              </small>
            </button>
          ))}
          <form onSubmit={create}>
            <input name="name" placeholder="新知识库名称" required />
            <button type="submit" className="secondary">
              添加
            </button>
          </form>
        </aside>
        <section className="panel">
          <header>
            <div>
              <h2>内容</h2>
              <p>支持 UTF-8 TXT / Markdown，单文件 1 MB</p>
            </div>
            <form onSubmit={upload}>
              <label className="file-button">
                选择文件
                <input name="file" type="file" accept=".txt,.md" required />
              </label>
              <button type="submit" className="primary small">
                上传
              </button>
            </form>
          </header>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>来源</th>
                <th>状态</th>
                <th>分块</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={String(document.id)}>
                  <td>{String(document.name)}</td>
                  <td>{String(document.source_type)}</td>
                  <td>
                    <span className={`status ${String(document.status)}`}>
                      {String(document.status)}
                    </span>
                  </td>
                  <td>{String(document.chunks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="faq-form" onSubmit={faq}>
            <h3>快速新增 FAQ</h3>
            <input name="question" placeholder="客户会怎么问？" required />
            <textarea name="answer" placeholder="准确答案" required />
            <button type="submit" className="secondary">
              保存 FAQ
            </button>
          </form>
        </section>
      </div>
    </ResourcePage>
  );
}
