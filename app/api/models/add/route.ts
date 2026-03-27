import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import path from "path";

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  provider?: string;
  status?: "online" | "offline";
}

interface Provider {
  id: string;
  api: string;
  accessMode?: "api_key" | "auth";
  apiKey?: string;
  models: Model[];
  usedBy: { id: string; emoji: string; name: string }[];
}

interface ConfigData {
  providers: Provider[];
  defaults: { model: string; fallbacks: string[] };
  agents?: any[];
}

function encryptApiKey(apiKey: string): string {
  // 简单的加密（实际应该使用更安全的方式）
  // 这里只是简单混淆，实际部署应该使用 crypto 等工具
  if (!apiKey) return "";
  return Buffer.from(apiKey).toString("base64");
}

function decryptApiKey(encrypted: string): string {
  if (!encrypted) return "";
  try {
    return Buffer.from(encrypted, "base64").toString();
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      providerId,
      modelId,
      modelName,
      apiKey,
      accessMode,
      contextWindow,
      maxTokens,
      reasoning,
      inputTypes,
      provider,
      status,
      baseUrl,
    } = body;

    // 验证必填字段
    if (!providerId || !modelId) {
      return NextResponse.json(
        { error: "Provider ID 和模型 ID 不能为空" },
        { status: 400 }
      );
    }

    // 读取当前配置
    const configPath = path.join(process.cwd(), "config.json");
    let config: ConfigData;

    try {
      const configContent = await readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      // 如果配置文件不存在，创建一个默认配置
      config = {
        providers: [],
        defaults: { model: "", fallbacks: [] },
        agents: [],
      };
    }

    // 查找或创建 Provider
    let providerRecord = config.providers.find((p) => p.id === providerId);

    if (!providerRecord) {
      // 创建新的 Provider
      providerRecord = {
        id: providerId,
        api: baseUrl || (apiKey ? "https://api.openai.com/v1" : ""),
        accessMode: accessMode || "api_key",
        models: [],
        usedBy: [],
      };

      // 如果提供了 API Key，添加到 Provider
      if (apiKey) {
        providerRecord.apiKey = encryptApiKey(apiKey);
      }

      config.providers.push(providerRecord);
    } else {
      // 更新现有 Provider
      if (accessMode) {
        providerRecord.accessMode = accessMode;
      }
      if (apiKey) {
        providerRecord.apiKey = encryptApiKey(apiKey);
      }
      if (baseUrl) {
        providerRecord.api = baseUrl;
      }
    }

    // 检查模型是否已存在
    const existingModelIndex = providerRecord.models.findIndex((m) => m.id === modelId);

    const newModel: Model = {
      id: modelId,
      name: modelName || modelId,
      contextWindow: contextWindow || 0,
      maxTokens: maxTokens || 0,
      reasoning: reasoning || false,
      input: inputTypes || ["text"],
      provider: provider || "",
      status: status || "online",
    };

    if (existingModelIndex >= 0) {
      // 更新现有模型
      providerRecord.models[existingModelIndex] = newModel;
    } else {
      // 添加新模型
      providerRecord.models.push(newModel);
    }

    // 保存配置
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "模型添加成功",
      provider: providerRecord.id,
      model: modelId,
    });
  } catch (error) {
    console.error("Add model error:", error);
    return NextResponse.json(
      { error: "添加模型失败" },
      { status: 500 }
    );
  }
}
