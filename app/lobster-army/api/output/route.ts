/**
 * 龙虾军团 - 工作产出管理 API
 * 
 * 职责：
 * 1. 存储 Agent 执行后的实质性产出
 * 2. 验证产出是否符合任务要求
 * 3. 支持人工审核产出
 * 4. 记录产出变更历史
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

// 产出存储目录
const OUTPUT_DIR = path.join(OPENCLAW_HOME, "lobster-outputs");
const OUTPUT_INDEX_FILE = path.join(OUTPUT_DIR, "output-index.json");

// 最小产出长度（字节）- 少于这个认为是无实质内容
const MIN_OUTPUT_LENGTH = 50;

// 允许的文件扩展名（附件）
const ALLOWED_ATTACHMENTS = [".txt", ".md", ".json", ".js", ".ts", ".py", ".sh", ".log", ".csv", ".html", ".css"];

export interface StepOutput {
  id: string;
  taskId: string;
  stepIndex: number;
  stepId: string;
  stepName: string;
  agentId: string;
  agentName?: string;
  
  // 产出内容
  content: string;           // 主要文本产出
  attachments: string[];      // 附件路径列表
  
  // 验证状态
  validationStatus: "pending" | "valid" | "invalid" | "empty";
  validationMessage?: string;
  validationDetails?: {
    lengthCheck: number;      // 内容长度
    minRequired: number;       // 最小要求
    codeBlocks?: number;      // 代码块数量（检测代码产出）
    links?: number;           // 链接数量
    lines?: number;           // 总行数
  };
  
  // 审核状态
  reviewStatus: "pending" | "approved" | "rejected" | "needs_revision";
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
  executionDurationMs?: number;  // 执行耗时
  
  // 版本历史
  history?: OutputHistoryEntry[];
}

export interface OutputHistoryEntry {
  timestamp: string;
  action: "created" | "updated" | "validated" | "reviewed" | "revision_requested";
  actor: string;           // agentId 或 "human"
  previousContent?: string;
  newContent?: string;
  note?: string;
}

interface OutputIndex {
  outputs: Record<string, StepOutput>;  // outputId -> StepOutput
  lastId: number;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readIndex(): OutputIndex {
  ensureDir(OUTPUT_DIR);
  try {
    if (fs.existsSync(OUTPUT_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(OUTPUT_INDEX_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("读取产出索引失败:", e);
  }
  return { outputs: {}, lastId: 0 };
}

function writeIndex(index: OutputIndex): boolean {
  try {
    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(OUTPUT_INDEX_FILE, JSON.stringify(index, null, 2));
    return true;
  } catch (e) {
    console.error("写入产出索引失败:", e);
    return false;
  }
}

/**
 * 验证产出内容是否符合要求
 */
export function validateOutput(content: string): {
  status: "valid" | "invalid" | "empty";
  message: string;
  details: StepOutput["validationDetails"];
} {
  if (!content || content.trim().length === 0) {
    return {
      status: "empty",
      message: "产出内容为空",
      details: { lengthCheck: 0, minRequired: MIN_OUTPUT_LENGTH, lines: 0 }
    };
  }
  
  const trimmed = content.trim();
  const length = Buffer.byteLength(trimmed, "utf-8");
  const lines = trimmed.split("\n").length;
  
  // 计算代码块数量
  const codeBlocks = (trimmed.match(/```[\s\S]*?```/g) || []).length;
  
  // 计算链接数量
  const links = (trimmed.match(/https?:\/\/[^\s]+/g) || []).length;
  
  const details: StepOutput["validationDetails"] = {
    lengthCheck: length,
    minRequired: MIN_OUTPUT_LENGTH,
    codeBlocks,
    links,
    lines
  };
  
  // 验证：内容长度
  if (length < MIN_OUTPUT_LENGTH) {
    return {
      status: "invalid",
      message: `产出内容过短（${length}字节），少于最低要求（${MIN_OUTPUT_LENGTH}字节）`,
      details
    };
  }
  
  // 验证：常见敷衍内容检测
  const lowQualityPatterns = [
    /^收到$/i, /^完成$/i, /^好的$/i, /^OK$/i, /^done$/i,
    /^已执行$/i, /^执行完成$/i, /^任务完成$/i,
    /^正在处理$/i, /^处理中$/i
  ];
  
  for (const pattern of lowQualityPatterns) {
    if (pattern.test(trimmed)) {
      return {
        status: "invalid",
        message: "产出内容疑似敷衍（仅简单回复，无实质内容）",
        details
      };
    }
  }
  
  // 验证通过
  return {
    status: "valid",
    message: `产出验证通过（${length}字节，${lines}行）`,
    details
  };
}

/**
 * 生成产出ID
 */
function generateOutputId(): string {
  return `out-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== API 端点 ====================

/**
 * POST /api/lobster-army/output
 * 创建或更新产出记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      taskId,
      stepIndex,
      stepId,
      stepName,
      agentId,
      agentName,
      content,
      attachments = [],
      reviewedBy
    } = body;

    if (!taskId || agentId === undefined) {
      return NextResponse.json({ error: "缺少必填字段：taskId, agentId" }, { status: 400 });
    }

    const index = readIndex();
    
    // 生成产出ID
    const outputId = body.outputId || generateOutputId();
    const now = new Date().toISOString();
    
    // 验证内容
    const validation = validateOutput(content || "");
    
    // 查找是否已存在相同 taskId+stepIndex 的产出
    const existingOutputId = Object.keys(index.outputs).find(
      id => index.outputs[id].taskId === taskId && index.outputs[id].stepIndex === stepIndex
    );
    
    if (existingOutputId) {
      // 更新现有产出
      const existing = index.outputs[existingOutputId];
      const historyEntry: OutputHistoryEntry = {
        timestamp: now,
        action: "updated",
        actor: agentId,
        previousContent: existing.content,
        newContent: content,
        note: "产出内容已更新"
      };
      
      index.outputs[existingOutputId] = {
        ...existing,
        content: content || existing.content,
        attachments: attachments.length > 0 ? attachments : existing.attachments,
        validationStatus: validation.status,
        validationMessage: validation.message,
        validationDetails: validation.details,
        updatedAt: now,
        history: [...(existing.history || []), historyEntry]
      };
      
      writeIndex(index);
      
      return NextResponse.json({
        success: true,
        output: index.outputs[existingOutputId],
        isUpdate: true,
        validation
      });
    }
    
    // 创建新产出
    const output: StepOutput = {
      id: outputId,
      taskId,
      stepIndex: stepIndex ?? 0,
      stepId: stepId || `step-${stepIndex ?? 0 + 1}`,
      stepName: stepName || `步骤${(stepIndex ?? 0) + 1}`,
      agentId,
      agentName,
      content: content || "",
      attachments,
      validationStatus: validation.status,
      validationMessage: validation.message,
      validationDetails: validation.details,
      reviewStatus: "pending",
      createdAt: now,
      updatedAt: now,
      history: [{
        timestamp: now,
        action: "created",
        actor: agentId,
        newContent: content,
        note: "首次创建产出"
      }]
    };
    
    index.outputs[outputId] = output;
    index.lastId++;
    
    writeIndex(index);
    
    return NextResponse.json({
      success: true,
      output,
      validation,
      message: "产出已记录"
    });

  } catch (e: any) {
    console.error("创建产出失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/lobster-army/output
 * 获取产出记录
 * Query params:
 * - taskId: 任务ID（必填）
 * - stepIndex: 步骤索引（可选，获取特定步骤产出）
 * - outputId: 产出ID（可选，直接获取特定产出）
 * - includeHistory: 是否包含历史记录（默认true）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const stepIndex = searchParams.get("stepIndex");
    const outputId = searchParams.get("outputId");
    const includeHistory = searchParams.get("includeHistory") !== "false";
    const validationStatus = searchParams.get("validationStatus"); // filter by validation
    const reviewStatus = searchParams.get("reviewStatus");         // filter by review

    if (!taskId && !outputId) {
      return NextResponse.json({ error: "缺少 taskId 或 outputId" }, { status: 400 });
    }

    const index = readIndex();
    let outputs: StepOutput[] = [];

    if (outputId) {
      // 直接获取特定产出
      const output = index.outputs[outputId];
      if (!output) {
        return NextResponse.json({ error: "产出不存在" }, { status: 404 });
      }
      return NextResponse.json({ output: includeHistory ? output : { ...output, history: undefined } });
    }

    // 获取任务的所有产出
    outputs = Object.values(index.outputs)
      .filter(o => o.taskId === taskId)
      .filter(o => stepIndex === null || o.stepIndex === parseInt(stepIndex))
      .filter(o => !validationStatus || o.validationStatus === validationStatus)
      .filter(o => !reviewStatus || o.reviewStatus === reviewStatus)
      .sort((a, b) => a.stepIndex - b.stepIndex);

    // 移除历史（减小响应大小）
    if (!includeHistory) {
      outputs = outputs.map(o => ({ ...o, history: undefined }));
    }

    return NextResponse.json({
      outputs,
      count: outputs.length,
      taskId
    });

  } catch (e: any) {
    console.error("获取产出失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PUT /api/lobster-army/output
 * 更新产出审核状态
 * Body: { outputId, action: "approve" | "reject" | "request_revision", note, reviewedBy }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { outputId, action, note, reviewedBy } = body;

    if (!outputId || !action) {
      return NextResponse.json({ error: "缺少 outputId 或 action" }, { status: 400 });
    }

    const validActions = ["approve", "reject", "request_revision"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `无效的action，必须是：${validActions.join(", ")}` }, { status: 400 });
    }

    const index = readIndex();
    const output = index.outputs[outputId];
    
    if (!output) {
      return NextResponse.json({ error: "产出不存在" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const actor = reviewedBy || "human";
    
    let newReviewStatus: StepOutput["reviewStatus"];
    let historyAction: OutputHistoryEntry["action"];

    switch (action) {
      case "approve":
        newReviewStatus = "approved";
        historyAction = "reviewed";
        break;
      case "reject":
        newReviewStatus = "rejected";
        historyAction = "reviewed";
        break;
      case "request_revision":
        newReviewStatus = "needs_revision";
        historyAction = "revision_requested";
        break;
      default:
        newReviewStatus = "pending";
        historyAction = "updated";
    }

    const historyEntry: OutputHistoryEntry = {
      timestamp: now,
      action: historyAction,
      actor,
      note: note || `人工审核: ${action}`,
      previousContent: output.content
    };

    output.reviewStatus = newReviewStatus;
    output.reviewNote = note;
    output.reviewedBy = actor;
    output.reviewedAt = now;
    output.updatedAt = now;
    output.history = [...(output.history || []), historyEntry];

    index.outputs[outputId] = output;
    writeIndex(index);

    return NextResponse.json({
      success: true,
      output,
      message: `产出已标记为：${newReviewStatus}`
    });

  } catch (e: any) {
    console.error("更新产出失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/lobster-army/output
 * 删除产出记录
 * Query params: outputId 或 taskId（删除任务所有产出）
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const outputId = searchParams.get("outputId");
    const taskId = searchParams.get("taskId");

    if (!outputId && !taskId) {
      return NextResponse.json({ error: "缺少 outputId 或 taskId" }, { status: 400 });
    }

    const index = readIndex();
    let deleted = 0;

    if (outputId) {
      if (index.outputs[outputId]) {
        delete index.outputs[outputId];
        deleted = 1;
      }
    } else if (taskId) {
      const keysToDelete = Object.keys(index.outputs).filter(id => index.outputs[id].taskId === taskId);
      for (const key of keysToDelete) {
        delete index.outputs[key];
        deleted++;
      }
    }

    writeIndex(index);

    return NextResponse.json({
      success: true,
      deleted,
      message: `已删除 ${deleted} 条产出记录`
    });

  } catch (e: any) {
    console.error("删除产出失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
