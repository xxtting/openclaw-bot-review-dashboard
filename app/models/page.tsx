"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  // 新字段
  provider?: string; // 显示用Provider名称，如 "OpenAI"
  status?: "online" | "offline";
  api?: string; // BaseURL
}

interface Provider {
  id: string;
  api: string;
  accessMode?: "api_key" | "auth";
  models: Model[];
  usedBy: { id: string; emoji: string; name: string }[];
}

interface ConfigData {
  providers: Provider[];
  defaults: { model: string; fallbacks: string[] };
}

interface ModelStat {
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messageCount: number;
  avgResponseMs: number;
}

interface TestResult {
  ok: boolean;
  text?: string;
  error?: string;
  elapsed: number;
}

// ============================================================
// 品牌预设数据
// ============================================================
interface BrandPreset {
  id: string;
  name: string;
  emoji: string;
  baseUrl: string;
  color: string;
}

const BRAND_PRESETS: BrandPreset[] = [
  // 国际品牌
  { id: "openai", name: "OpenAI", emoji: "🤖", baseUrl: "https://api.openai.com/v1", color: "#10a37f" },
  { id: "anthropic", name: "Anthropic", emoji: "🧠", baseUrl: "https://api.anthropic.com/v1", color: "#d4a574" },
  { id: "google", name: "Google", emoji: "🔵", baseUrl: "https://generativelanguage.googleapis.com/v1beta", color: "#4285f4" },
  { id: "deepseek", name: "DeepSeek", emoji: "🌊", baseUrl: "https://api.deepseek.com/v1", color: "#0066cc" },
  { id: "ollama", name: "Ollama", emoji: "🦙", baseUrl: "http://localhost:11434/v1", color: "#cc4a1a" },
  { id: "groq", name: "Groq", emoji: "⚡", baseUrl: "https://api.groq.com/openai/v1", color: "#f0660a" },
  { id: "openrouter", name: "OpenRouter", emoji: "🌐", baseUrl: "https://openrouter.ai/api/v1", color: "#555555" },
  // 中国品牌
  { id: "tencent", name: "腾讯混元", emoji: "🐧", baseUrl: "https://hunyuan.cloud.tencent.com/v1", color: "#ff6a00" },
  { id: "aliyun", name: "阿里通义", emoji: "☁️", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", color: "#ff6a00" },
  { id: "volcengine", name: "火山引擎", emoji: "🌋", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", color: "#ff5252" },
  { id: "baidu", name: "百度文心", emoji: "🔍", baseUrl: "https://qianfan.baidubce.com/v2", color: "#2932e1" },
  { id: "zhipu", name: "智谱AI", emoji: "✨", baseUrl: "https://open.bigmodel.cn/api/paas/v4", color: "#7b32d8" },
  { id: "minimax", name: "MiniMax", emoji: "📉", baseUrl: "https://api.minimax.chat/v1", color: "#00d4aa" },
  { id: "moonshot", name: "Moonshot", emoji: "🌙", baseUrl: "https://api.moonshot.cn/v1", color: "#fb9700" },
  { id: "siliconflow", name: "SiliconFlow", emoji: "⚡", baseUrl: "https://api.siliconflow.cn/v1", color: "#6c40d9" },
  { id: "iflytek", name: "讯飞星火", emoji: "🔥", baseUrl: "https://spark-api.xf-yun.com/v3.5/chat", color: "#ff4b4b" },
  { id: "senscore", name: "商汤日日新", emoji: "🟡", baseUrl: "https://api.sensetime.com/v1", color: "#f5c842" },
  { id: "dashscope", name: "阿里百炼", emoji: "💎", baseUrl: "https://dashscope.aliyuncs.com/api/v1", color: "#1677ff" },
  { id: "tiangel", name: "天工AI", emoji: "⚙️", baseUrl: "https://api.tiangong.cn/v1", color: "#4a90e2" },
  // Coding 专用
  { id: "cursor", name: "Cursor", emoji: "✏️", baseUrl: "https://api.cursor.com/v1", color: "#7c3aed" },
  { id: "copilot", name: "GitHub Copilot", emoji: "💻", baseUrl: "https://api.githubcopilot.com", color: "#238636" },
  { id: "claude-code", name: "Claude Code", emoji: "🧬", baseUrl: "https://api.claudecode.ai/v1", color: "#d4a574" },
  { id: "windsurf", name: "Windsurf", emoji: "🌊", baseUrl: "https://api.windsurf.ai/v1", color: "#06b6d4" },
  { id: "devin", name: "Devin", emoji: "🤖", baseUrl: "https://api.devin.ai/v1", color: "#6366f1" },
  { id: "replit", name: "Replit", emoji: "🔁", baseUrl: "https://api.replit.com/v1", color: "#f26207" },
  { id: "codeium", name: "Codeium", emoji: "⚡", baseUrl: "https://api.codeium.com/v1", color: "#09b6d2" },
  { id: "tabnine", name: "Tabnine", emoji: "🔮", baseUrl: "https://api.tabnine.com/v1", color: "#ff6b6b" },
  { id: "custom", name: "自定义", emoji: "⚙️", baseUrl: "", color: "#64748b" },
];

// 格式化数字
function formatNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

// ============================================================
// Pixel-style Model Row Component
// ============================================================
interface ModelRowProps {
  index: number;
  model: Model;
  providerId: string;

  stat?: ModelStat;
  onDelete: (providerId: string, modelId: string) => void;
}

function formatTokens(n: number): string {
  if (!n) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatMs(ms: number): string {
  if (!ms) return "-";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function ModelRow({ index, model, providerId, stat, onDelete }: ModelRowProps) {
  const { t } = useI18n();
  const isOnline = model.status !== "offline";

  return (
    <tr className="border-b border-[var(--border)]/40 hover:bg-[var(--bg)]/60 transition-colors"
        style={{ imageRendering: "pixelated" }}>
      {/* 序号 */}
      <td className="py-2 px-2 text-center text-[var(--text-muted)] text-xs font-mono whitespace-nowrap">
        {index}
      </td>
      {/* 模型 ID */}
      <td className="py-2 px-2">
        <div className="font-mono text-[var(--accent)] text-xs whitespace-nowrap">{model.id}</div>
      </td>
      {/* 名称 */}
      <td className="py-2 px-2">
        <div className="text-xs text-[var(--text)] whitespace-nowrap">{model.name || "-"}</div>
      </td>
      {/* Provider */}
      <td className="py-2 px-2">
        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] whitespace-nowrap">
          {model.provider || providerId}
        </span>
      </td>
      {/* 上下文窗口 */}
      <td className="py-2 px-2 text-right">
        <span className="text-xs font-mono text-[var(--text)] whitespace-nowrap">
          {model.contextWindow ? formatTokens(model.contextWindow) : "-"}
        </span>
      </td>
      {/* 最大输出 */}
      <td className="py-2 px-2 text-right">
        <span className="text-xs font-mono text-[var(--text)] whitespace-nowrap">
          {model.maxTokens ? formatTokens(model.maxTokens) : "-"}
        </span>
      </td>
      {/* 输入类型 */}
      <td className="py-2 px-2">
        <div className="flex gap-1 flex-wrap">
          {(model.input || ["text"]).map((it) => (
            <span key={it} className="text-xs px-1 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] whitespace-nowrap">
              {it === "text" ? "📝" : "🖼️"} {it}
            </span>
          ))}
        </div>
      </td>
      {/* 推理 */}
      <td className="py-2 px-2 text-center">
        <span className="text-xs">{model.reasoning ? "✅" : "❌"}</span>
      </td>
      {/* 状态 */}
      <td className="py-2 px-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{
              backgroundColor: isOnline ? "#4ade80" : "#64748b",
              boxShadow: isOnline ? "0 0 6px #4ade80aa" : "none",
            }}
          />
          <span className={`text-xs whitespace-nowrap ${isOnline ? "text-green-400" : "text-slate-500"}`}>
            {isOnline ? t("models.statusOnline") : t("models.statusOffline")}
          </span>
        </div>
      </td>
      {/* Input Token */}
      <td className="py-2 px-2 text-right">
        <span className="text-xs font-mono text-blue-400 whitespace-nowrap">{stat ? formatTokens(stat.inputTokens) : "-"}</span>
      </td>
      {/* Output Token */}
      <td className="py-2 px-2 text-right">
        <span className="text-xs font-mono text-emerald-400 whitespace-nowrap">{stat ? formatTokens(stat.outputTokens) : "-"}</span>
      </td>
      {/* 平均响应 */}
      <td className="py-2 px-2 text-right">
        <span className="text-xs font-mono text-amber-400 whitespace-nowrap">{stat ? formatMs(stat.avgResponseMs) : "-"}</span>
      </td>
      {/* 操作 */}
      <td className="py-2 px-2">
        <button
          onClick={() => onDelete(providerId, model.id)}
          className="px-2 py-1 text-xs rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition cursor-pointer whitespace-nowrap"
        >
          {t("models.delete")}
        </button>
      </td>
    </tr>
  );
}

// ============================================================
// Add/Edit Model Form Modal
// ============================================================
interface ModelFormModalProps {
  mode: "add" | "edit";
  initialData?: { model: Model; providerId: string };
  onClose: () => void;
  onSuccess: () => void;
}

function ModelFormModal({ mode, initialData, onClose, onSuccess }: ModelFormModalProps) {
  const { t } = useI18n();

  const [form, setForm] = useState({
    providerId: initialData?.providerId ?? "",
    modelId: initialData?.model?.id ?? "",
    modelName: initialData?.model?.name ?? "",
    provider: initialData?.model?.provider ?? "",
    baseUrl: initialData?.model?.api ?? "",
    apiKey: "",
    accessMode: "api_key" as "api_key" | "auth",
    contextWindow: 0,
    maxTokens: 0,
    reasoning: false,
    inputTypes: ["text"] as string[],
    status: (initialData?.model?.status ?? "online") as "online" | "offline",
  });

  const [selectedBrand, setSelectedBrand] = useState<string>(
    BRAND_PRESETS.find((b) => b.id === (initialData?.providerId ?? ""))?.id ?? "custom"
  );

  // Fetch models state
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeModels, setProbeModels] = useState<Array<{ id: string; name: string }>>([]);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Apply brand preset to form fields
  const applyBrandPreset = (brandId: string) => {
    const brand = BRAND_PRESETS.find((b) => b.id === brandId);
    setSelectedBrand(brandId);
    if (!brand || brandId === "custom") {
      // 自定义：清空预设值，保留用户输入
      setForm((prev) => ({
        ...prev,
        providerId: brandId === "custom" ? "" : prev.providerId,
        provider: brandId === "custom" ? "" : prev.provider,
        baseUrl: brandId === "custom" ? "" : prev.baseUrl,
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      providerId: brand.id,
      provider: brand.name,
      baseUrl: brand.baseUrl,
    }));
    // Reset probe results when brand changes
    setProbeModels([]);
    setProbeError(null);
  };

  // Fetch available models from provider
  const fetchModels = async () => {
    if (!form.apiKey) {
      setProbeError(t("models.probeNeedApiKey"));
      return;
    }
    setProbeLoading(true);
    setProbeError(null);
    setProbeModels([]);

    try {
      const resp = await fetch("/api/models/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: form.providerId,
          apiKey: form.apiKey,
          baseUrl: form.baseUrl,
        }),
      });
      const data = await resp.json();
      if (data.error && !data.models?.length) {
        setProbeError(data.error);
      } else {
        setProbeModels(data.models || []);
        if (!data.models?.length) {
          setProbeError(t("models.probeNoModels"));
        }
      }
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : t("models.probeFailed"));
    } finally {
      setProbeLoading(false);
    }
  };

  // Select a probed model
  const selectProbeModel = (modelId: string) => {
    setForm((prev) => ({ ...prev, modelId, modelName: modelId }));
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url =
        mode === "add"
          ? "/api/models/add"
          : `/api/models/${initialData?.providerId}/${initialData?.model?.id}`;

      const method = mode === "add" ? "POST" : "PUT";

      const body: Record<string, unknown> = {
        providerId: form.providerId,
        modelId: form.modelId,
        modelName: form.modelName,
        provider: form.provider,
        baseUrl: form.baseUrl,
        accessMode: form.accessMode,
        contextWindow: form.contextWindow,
        maxTokens: form.maxTokens,
        reasoning: form.reasoning,
        inputTypes: form.inputTypes,
        status: form.status,
      };

      if (form.apiKey) {
        body.apiKey = form.apiKey;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || t("models.addFailed"));
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("models.addFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6"
        style={{ imageRendering: "pixelated" }}
      >
        {/* Pixel-style header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold tracking-wide uppercase">
            {mode === "add" ? t("models.addModel") : t("models.editModel")}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition text-lg font-bold"
            style={{ imageRendering: "pixelated" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded border-2 border-red-500/40 bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Brand Preset Dropdown Select */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.selectBrand")}
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => applyBrandPreset(e.target.value)}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
            >
              {BRAND_PRESETS.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.emoji} {brand.name}
                </option>
              ))}
            </select>
          </div>

          {/* Provider ID */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.providerId")} *
            </label>
            <input
              type="text"
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
              placeholder="openai"
              required
              disabled={mode === "edit"}
            />
          </div>

          {/* Provider display name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.provider")}
            </label>
            <input
              type="text"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
              placeholder="OpenAI"
            />
          </div>

          {/* BaseURL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.baseUrl")}
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => {
                setForm({ ...form, baseUrl: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm font-mono"
              placeholder="https://api.openai.com/v1"
            />
          </div>

          {/* Model ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("models.modelId")} *
              </label>
              {mode === "add" && (
                <button
                  type="button"
                  onClick={fetchModels}
                  disabled={probeLoading || !form.apiKey || !form.providerId}
                  className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                  style={{
                    borderColor: "var(--accent)",
                    color: "var(--accent)",
                    background: "var(--bg)",
                  }}
                >
                  {probeLoading ? "..." : t("models.probeFetch")}
                </button>
              )}
            </div>

            {/* Fetched models dropdown */}
            {probeModels.length > 0 && (
              <div className="mb-2">
                <select
                  onChange={(e) => selectProbeModel(e.target.value)}
                  value={form.modelId}
                  className="w-full px-3 py-2 rounded border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text)] focus:outline-none text-sm"
                >
                  <option value="">{t("models.probeSelectModel")}</option>
                  {probeModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Probe error */}
            {probeError && (
              <div className="mb-2 px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {probeError}
              </div>
            )}

            {/* Manual input */}
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm font-mono"
              placeholder="gpt-4o-mini"
              required
              disabled={mode === "edit"}
            />
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.modelName")}
            </label>
            <input
              type="text"
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
              placeholder="GPT-4o Mini"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.status")}
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="online"
                  checked={form.status === "online"}
                  onChange={() => setForm({ ...form, status: "online" })}
                  className="accent-green-500"
                />
                <span className="flex items-center gap-1.5 text-sm">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "#4ade80", boxShadow: "0 0 6px #4ade80aa" }}
                  />
                  {t("models.statusOnline")}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="offline"
                  checked={form.status === "offline"}
                  onChange={() => setForm({ ...form, status: "offline" })}
                  className="accent-slate-500"
                />
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  {t("models.statusOffline")}
                </span>
              </label>
            </div>
          </div>

          {/* API Key (only for add) */}
          {mode === "add" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                {t("models.apiKey")}
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm font-mono"
                placeholder="sk-..."
              />
            </div>
          )}

          {/* Access Mode */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t("models.accessMode")}
            </label>
            <select
              value={form.accessMode}
              onChange={(e) => setForm({ ...form, accessMode: e.target.value as "api_key" | "auth" })}
              className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
            >
              <option value="api_key">api_key</option>
              <option value="auth">auth</option>
            </select>
          </div>

          {/* Context Window & Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                {t("models.contextWindow")}
              </label>
              <input
                type="number"
                value={form.contextWindow || ""}
                onChange={(e) => setForm({ ...form, contextWindow: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
                placeholder="128000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                {t("models.maxTokens")}
              </label>
              <input
                type="number"
                value={form.maxTokens || ""}
                onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded border-2 border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
                placeholder="4096"
              />
            </div>
          </div>

          {/* Reasoning */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="reasoning"
              checked={form.reasoning}
              onChange={(e) => setForm({ ...form, reasoning: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <label htmlFor="reasoning" className="text-sm">{t("models.supportReasoning")}</label>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded border-2 border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)] font-bold text-sm uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition"
              style={{ imageRendering: "pixelated" }}
            >
              {loading ? t("models.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded border-2 border-[var(--border)] text-[var(--text)] text-sm font-bold uppercase tracking-wider hover:border-[var(--text-muted)] transition"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Main Models Page
// ============================================================
export default function ModelsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<ConfigData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<{ model: Model; providerId: string } | null>(null);

  // Stats state
  const [modelStats, setModelStats] = useState<Record<string, ModelStat>>({});

  // Build flat model list
  const allModels: Array<{ model: Model; providerId: string; accessMode?: string }> = [];
  if (data) {
    for (const provider of data.providers) {
      for (const model of provider.models) {
        allModels.push({ model, providerId: provider.id, accessMode: provider.accessMode });
      }
    }
  }

  const totalModels = allModels.length;

  const loadData = async () => {
    try {
      const resp = await fetch("/api/config");
      const json = await resp.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch("/api/stats-models", { signal: controller.signal });
      clearTimeout(timeout);
      const json = await resp.json();
      if (!json.error && json.models) {
        const map: Record<string, ModelStat> = {};
        for (const m of json.models) {
          map[`${m.provider}/${m.modelId}`] = m;
        }
        setModelStats(map);
      }
    } catch { /* ignore stats errors */ }
  };

  useEffect(() => {
    loadData();
    // 延迟加载统计，不阻塞首屏渲染
    const timer = setTimeout(loadStats, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleEdit = (model: Model, providerId: string) => {
    setEditTarget({ model, providerId });
    setShowEditModal(true);
  };

  const handleDelete = async (providerId: string, modelId: string) => {
    if (!confirm(t("models.confirmDelete"))) return;

    try {
      const response = await fetch(`/api/models/${providerId}/${modelId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || t("models.deleteFailed"));
        return;
      }

      await loadData();
    } catch {
      alert(t("models.deleteFailed"));
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("common.loadError")}: {error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-[var(--text-muted)] text-sm">{t("common.loading")}</div>
        {/* Skeleton table */}
        <div className="w-full max-w-6xl rounded-xl border-2 border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-[var(--border)] bg-[var(--bg)]" />
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-center animate-pulse">
                <div className="w-6 h-4 rounded bg-[var(--bg)]" />
                <div className="w-32 h-4 rounded bg-[var(--bg)]" />
                <div className="w-24 h-4 rounded bg-[var(--bg)]" />
                <div className="w-16 h-4 rounded bg-[var(--bg)]" />
                <div className="flex-1" />
                <div className="w-16 h-4 rounded bg-[var(--bg)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        .pixel-font { font-family: 'Press Start 2P', monospace !important; }
      `}</style>

      <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto" style={{ imageRendering: "pixelated" }}>
        {/* Header */}
        <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1
              className="text-xl font-bold pixel-font tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              {t("models.title")}
            </h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {t("models.totalPrefix")} {totalModels} {t("models.modelCount")}
              {" · "}
              {data.providers.length} {t("models.providerCount")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded border-2 border-green-500/50 bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider hover:bg-green-500/30 transition cursor-pointer"
              style={{ imageRendering: "pixelated" }}
            >
              + {t("models.addModel")}
            </button>
            <Link
              href="/"
              className="px-4 py-2 rounded border-2 border-[var(--border)] text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            >
              ← {t("common.backOverview")}
            </Link>
          </div>
        </div>

        {/* Pixel-style panel */}
        <div
          className="rounded-xl border-2 border-[var(--border)] bg-[var(--card)] overflow-hidden"
          style={{ imageRendering: "pixelated" }}
        >
          {/* Panel header bar */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b-2 border-[var(--border)]"
            style={{ background: "var(--bg)", imageRendering: "pixelated" }}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "#4ade80", boxShadow: "0 0 8px #4ade80aa" }}
            />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] pixel-font">
              {t("models.modelList")}
            </span>
          </div>

          {totalModels === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
              <span className="text-4xl mb-4">📦</span>
              <p className="text-sm">{t("models.noModels")}</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 px-4 py-2 rounded border-2 border-green-500/50 bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider hover:bg-green-500/30 transition cursor-pointer"
              >
                + {t("models.addModel")}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr
                    className="border-b-2 border-[var(--border)] text-[var(--text-muted)] text-[10px] uppercase tracking-wider"
                    style={{ background: "var(--bg)", imageRendering: "pixelated" }}
                  >
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">#</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colModel")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colName")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colProvider")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colContext")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colMaxOutput")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colInputType")}</th>
                    <th className="text-center py-2 px-2 font-bold whitespace-nowrap">{t("models.colReasoning")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colStatus")}</th>
                    <th className="text-right py-2 px-2 font-bold whitespace-nowrap">{t("models.colInputToken")}</th>
                    <th className="text-right py-2 px-2 font-bold whitespace-nowrap">{t("models.colOutputToken")}</th>
                    <th className="text-right py-2 px-2 font-bold whitespace-nowrap">{t("models.colAvgResponse")}</th>
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap">{t("models.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allModels.map(({ model, providerId, accessMode }, idx) => {
                    const statKey = `${providerId}/${model.id}`;
                    return (
                      <ModelRow
                        key={statKey}
                        index={idx + 1}
                        model={model}
                        providerId={providerId}

                        stat={modelStats[statKey]}
                        onDelete={handleDelete}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add Modal */}
      {showAddModal && (
        <ModelFormModal
          mode="add"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && editTarget && (
        <ModelFormModal
          mode="edit"
          initialData={editTarget}
          onClose={() => {
            setShowEditModal(false);
            setEditTarget(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditTarget(null);
            loadData();
          }}
        />
      )}
    </>
  );
}
