import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import path from "path";

interface ConfigData {
  providers: any[];
  defaults: { model: string; fallbacks: string[] };
  agents?: any[];
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string; modelId: string }> }
) {
  try {
    const { providerId, modelId } = await params;

    // 读取当前配置
    const configPath = path.join(process.cwd(), "config.json");
    let config: ConfigData;

    try {
      const configContent = await readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      return NextResponse.json(
        { error: "配置文件不存在" },
        { status: 404 }
      );
    }

    // 查找 Provider
    const provider = config.providers.find((p) => p.id === providerId);

    if (!provider) {
      return NextResponse.json(
        { error: "Provider 不存在" },
        { status: 404 }
      );
    }

    // 查找并删除模型
    const modelIndex = provider.models.findIndex((m: any) => m.id === modelId);

    if (modelIndex < 0) {
      return NextResponse.json(
        { error: "模型不存在" },
        { status: 404 }
      );
    }

    // 删除模型
    provider.models.splice(modelIndex, 1);

    // 如果 Provider 没有模型了，可以选择删除 Provider
    // 但这里保留 Provider 结构

    // 保存配置
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "模型删除成功",
    });
  } catch (error) {
    console.error("Delete model error:", error);
    return NextResponse.json(
      { error: "删除模型失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string; modelId: string }> }
) {
  try {
    const { providerId, modelId } = await params;
    const body = await request.json();
    const { modelName, contextWindow, maxTokens, reasoning, inputTypes, provider: providerDisplayName, status, baseUrl } = body;

    // 读取当前配置
    const configPath = path.join(process.cwd(), "config.json");
    let config: ConfigData;

    try {
      const configContent = await readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      return NextResponse.json(
        { error: "配置文件不存在" },
        { status: 404 }
      );
    }

    // 查找 Provider 和模型
    const providerRecord = config.providers.find((p) => p.id === providerId);

    if (!providerRecord) {
      return NextResponse.json(
        { error: "Provider 不存在" },
        { status: 404 }
      );
    }

    const model = providerRecord.models.find((m: any) => m.id === modelId);

    if (!model) {
      return NextResponse.json(
        { error: "模型不存在" },
        { status: 404 }
      );
    }

    // 更新模型信息
    if (modelName !== undefined) model.name = modelName;
    if (contextWindow !== undefined) model.contextWindow = contextWindow;
    if (maxTokens !== undefined) model.maxTokens = maxTokens;
    if (reasoning !== undefined) model.reasoning = reasoning;
    if (inputTypes !== undefined) model.input = inputTypes;
    if (providerDisplayName !== undefined) model.provider = providerDisplayName;
    if (status !== undefined) model.status = status;
    if (baseUrl !== undefined) providerRecord.api = baseUrl;

    // 保存配置
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "模型更新成功",
    });
  } catch (error) {
    console.error("Update model error:", error);
    return NextResponse.json(
      { error: "更新模型失败" },
      { status: 500 }
    );
  }
}
