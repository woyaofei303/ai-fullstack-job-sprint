"use client";

import { type FormEvent, useState } from "react";
import { api } from "../shared/api";
import type { User } from "../shared/types";
import { Centered, errorText } from "../shared/ui";

export default function Login({ onLogin }: { onLogin(user: User): void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api<User>("/admin/auth/login", {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries(new FormData(event.currentTarget)),
          ),
        }),
      );
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }
  return (
    <Centered>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">S</div>
        <p className="eyebrow">SUPPORTLY CONSOLE</p>
        <h1>欢迎回来</h1>
        <p>登录自动化客服工作台</p>
        <label>
          邮箱
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="admin@example.com"
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={10}
            required
          />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "登录中…" : "登录工作台"}
        </button>
      </form>
    </Centered>
  );
}
