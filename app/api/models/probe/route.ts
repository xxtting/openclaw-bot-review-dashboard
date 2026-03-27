import { NextRequest, NextResponse } from "next/server";

interface ProbeResult {
  models: Array<{ id: string; name: string; contextWindow?: number; maxTokens?: number }>;
  error?: string;
}

const OPENAI_COMPATIBLE_PROVIDERS = [
  "openai", "anthropic", "deepseek", "moonshot", "zhipu",
  "minimax", "siliconflow", "groq", "openrouter", "ollama",
  "custom",
];

// Known model context windows for providers without a listing API
const KNOWN_MODELS: Record<string, Array<{ id: string; name: string; contextWindow?: number; maxTokens?: number }>> = {
  anthropic: [
    { id: "claude-opus-4-20250514", name: "Claude Opus 4", contextWindow: 200000, maxTokens: 8192 },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000, maxTokens: 8192 },
    { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", contextWindow: 200000, maxTokens: 8192 },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (2024-10-22)", contextWindow: 200000, maxTokens: 8192 },
    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", contextWindow: 200000, maxTokens: 8192 },
    { id: "claude-3-opus-latest", name: "Claude 3 Opus", contextWindow: 200000, maxTokens: 4096 },
    { id: "claude-3-sonnet-latest", name: "Claude 3 Sonnet", contextWindow: 200000, maxTokens: 4096 },
    { id: "claude-3-haiku-latest", name: "Claude 3 Haiku", contextWindow: 200000, maxTokens: 4096 },
  ],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, apiKey, baseUrl } = body;

    if (!providerId || !apiKey) {
      return NextResponse.json({ error: "providerId and apiKey are required" }, { status: 400 });
    }

    const result: ProbeResult = { models: [] };

    // Use known models for Anthropic (no public listing endpoint)
    if (providerId === "anthropic") {
      result.models = KNOWN_MODELS.anthropic || [];
      return NextResponse.json(result);
    }

    // For OpenAI-compatible providers, fetch from /v1/models
    const apiBase = baseUrl
      ? baseUrl.replace(/\/$/, "")
      : getDefaultUrl(providerId);

    if (!apiBase) {
      return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
    }

    try {
      const response = await fetch(`${apiBase}/models`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({
          error: `API error ${response.status}: ${errorText.slice(0, 200)}`,
          models: [],
        }, { status: 200 });
      }

      const data = await response.json();

      // Handle OpenAI format: { data: [{ id, object: "model", ... }] }
      if (Array.isArray(data.data)) {
        result.models = data.data
          .filter((m: any) => m.id && !m.id.startsWith("gpt-") || m.id.startsWith("gpt-"))
          .map((m: any) => ({
            id: m.id,
            name: m.id,
          }));
      } else if (Array.isArray(data.models)) {
        // Generic format
        result.models = data.models.map((m: any) => ({
          id: typeof m === "string" ? m : m.id,
          name: typeof m === "string" ? m : (m.name || m.id),
        }));
      } else if (Array.isArray(data)) {
        result.models = data.map((m: any) => ({
          id: typeof m === "string" ? m : m.id,
          name: typeof m === "string" ? m : (m.name || m.id),
        }));
      }
    } catch (fetchErr: any) {
      result.error = `Fetch error: ${fetchErr.message}`;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getDefaultUrl(providerId: string): string {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    moonshot: "https://api.moonshot.cn/v1",
    zhipu: "https://open.bigmodel.cn/api/paas/v4",
    minimax: "https://api.minimax.chat/v1",
    siliconflow: "https://api.siliconflow.cn/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    ollama: "http://localhost:11434/v1",
  };
  return urls[providerId] || "";
}
