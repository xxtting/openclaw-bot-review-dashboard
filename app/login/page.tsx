"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("auth.loginFailed"));
        return;
      }

      // 登录成功，重定向到首页
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-md p-8 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🦞</div>
          <h1 className="text-2xl font-bold mb-2">OpenClaw Dashboard</h1>
          <p className="text-[var(--text-muted)] text-sm">{t("auth.welcome")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
              placeholder={t("auth.passwordPlaceholder")}
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition"
          >
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-[var(--text-muted)] text-xs">
            {t("auth.version")}: 1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}
