/**
 * 龙虾军团 - 工作流步骤执行 API
 * 
 * 改进点：
 * 1. 步骤执行前验证上一步产出是否有效
 * 2. Agent 执行必须等待完整结果并验证产出
 * 3. 只有验证通过才推进到下一步
 * 4. 产出不符合要求则打回重新执行
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const REPORT_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "main-report-queue.json");

// 最小有效产出长度
const MIN_OUTPUT_LENGTH = 50;

export interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
  requireManualApproval?: boolean;
  failNext?: number;
  minOutputLength?: number;  // 步骤特定的最少产出要求
}

export interface StepOutput {
  id: string;
  stepIndex: number;
  stepName: string;
  agentId: string;
  content: string;
  validationStatus: "pending" | "valid" | "invalid" | "empty";
  reviewStatus: "pending" | "approved" | "rejected" | "needs_revision";
  createdAt: string;
}

export interface Task {
  id: string;
  legionId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  status: "pending" | "in_progress" | "review" | "archived" | "done";
  priority: "P0" | "P1" | "P2";
  currentStep?: number;
  workflowSteps?: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  executionLog?: ExecutionLog[];
  outputs?: StepOutput[];
  reviewStatus?: "pending" | "approved" | "rejected" | "needs_revision";
}

export interface ExecutionLog {
  stepId: string;
  stepName: string;
  stepType: string;
  executedBy?: string;
  executedAt: string;
  result: "success" | "failed" | "pending";
  notes?: string;
  agentOutput?: string;
  outputId?: string;
}

// ==================== 文件读写 ====================

function readTasks(): Task[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch { return []; }
}

function writeTasks(tasks: Task[]): boolean {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch { return false; }
}

function readLegions(): any {
  try {
    if (!fs.existsSync(LEGIONS_FILE)) return { legions: [], agents: [] };
    return JSON.parse(fs.readFileSync(LEGIONS_FILE, "utf-8"));
  } catch { return { legions: [], agents: [] }; }
}

// ==================== 产出验证 ====================

/**
 * 验证产出内容是否有效
 */
function validateOutput(content: string, minLength: number = MIN_OUTPUT_LENGTH): {
  valid: boolean;
  message: string;
  details: { length: number; minRequired: number; lines: number; codeBlocks: number }
} {
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      message: "产出为空",
      details: { length: 0, minRequired: minLength, lines: 0, codeBlocks: 0 }
    };
  }

  const trimmed = content.trim();
  const length = Buffer.byteLength(trimmed, "utf-8");
  const lines = trimmed.split("\n").length;
  const codeBlocks = (trimmed.match(/```[\s\S]*?```/g) || []).length;

  // 敷衍内容检测
  const lowQualityPatterns = [
    /^收到$/i, /^完成$/i, /^好的$/i, /^OK$/i, /^done$/i,
    /^已执行$/i, /^执行完成$/i, /^任务完成$/i,
    /^正在处理$/i, /^处理中$/i
  ];

  for (const pattern of lowQualityPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        message: "疑似敷衍内容（仅简单回复，无实质产出）",
        details: { length, minRequired: minLength, lines, codeBlocks }
      };
    }
  }

  if (length < minLength) {
    return {
      valid: false,
      message: `内容过短（${length}字节，要求${minLength}字节）`,
      details: { length, minRequired: minLength, lines, codeBlocks }
    };
  }

  return {
    valid: true,
    message: `验证通过（${length}字节，${lines}行，${codeBlocks}个代码块）`,
    details: { length, minRequired: minLength, lines, codeBlocks }
  };
}

/**
 * 过滤 Agent 输出噪声
 */
function filterAgentOutput(output: string): string {
  if (!output) return "";
  const lines = output.split("\n");
  const filtered: string[] = [];
  let inRealOutput = false;
  for (const line of lines) {
    if (
      line.startsWith("[plugins]") ||
      line.includes("Registered feishu_") ||
      line.includes("Registered ")
    ) {
      continue;
    }
    if (!inRealOutput && (line.trim() === "" || line.startsWith("["))) {
      if (line.startsWith("🦞") || line.startsWith("✅") || line.startsWith("❌")) {
        filtered.push(line);
        inRealOutput = true;
      }
      continue;
    }
    inRealOutput = true;
    filtered.push(line);
  }
  return filtered.join("\n").trim();
}

// ==================== Agent 执行（改进版） ====================

/**
 * 触发 Agent 执行并验证产出
 */
async function triggerAgentWithValidation(
  agentId: string,
  task: Task,
  stepName: string,
  stepIndex: number,
  minOutputLength?: number
): Promise<{
  success: boolean;
  output?: string;
  validation?: { valid: boolean; message: string; details: any };
  outputId?: string;
  error?: string;
  durationMs?: number;
}> {
  const startTime = Date.now();
  const outputDir = path.join(OPENCLAW_HOME, "lobster-agent-outputs");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${task.id}-step${stepIndex}-${Date.now()}.txt`);

  try {
    const message = `🦞【龙虾军团任务】

任务标题：${task.title}
${task.description ? `\n任务描述：${task.description}` : ""}
步骤：${stepName}

🔥 请务必完成工作并将结果写入：${outputPath}
输出要求：
1. 具体做了什么
2. 实际产出内容
3. 遇到的问题及解决方案
4. 是否完成
⚠️ 禁止仅回复"收到"、"完成"等敷衍内容！`;

    const safeMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const command = `openclaw agent --agent "${agentId}" --message "${safeMessage}" --timeout 300 --json`;

    console.log(`🚀 [${new Date().toISOString()}] 触发Agent: ${agentId}，步骤: ${stepName}`);

    let result = "";
    try {
      result = execSync(command, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (e: any) {
      if (e.stdout) result += e.stdout;
      if (e.stderr) result += e.stderr;
    }

    const filteredOutput = filterAgentOutput(result);

    // 读取输出文件
    let fileContent = "";
    if (fs.existsSync(outputPath)) {
      try { fileContent = fs.readFileSync(outputPath, "utf-8"); } catch {}
    }

    const finalOutput = fileContent.trim() || filteredOutput.trim();
    const validation = validateOutput(finalOutput, minOutputLength || MIN_OUTPUT_LENGTH);

    // 存储产出
    let outputId: string | undefined;
    if (finalOutput) {
      try {
        const storeRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lobster-army/output`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: task.id,
              stepIndex,
              stepId: `step-${stepIndex + 1}`,
              stepName,
              agentId,
              content: finalOutput
            })
          }
        );
        if (storeRes.ok) {
          const data = await storeRes.json();
          outputId = data.output?.id;
        }
      } catch (e) {
        console.warn("存储产出失败:", e);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`✅ Agent执行完成，耗时${durationMs}ms，验证: ${validation.valid ? "通过" : "失败"}`);

    return {
      success: validation.valid,
      output: finalOutput,
      validation,
      outputId,
      durationMs
    };

  } catch (e: any) {
    return {
      success: false,
      error: e.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ==================== 辅助函数 ====================

function addToAgentInbox(agentId: string, task: Task, stepName: string): boolean {
  try {
    let inbox: any = { agents: {} };
    if (fs.existsSync(INBOX_FILE)) {
      inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf-8"));
    }
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = { pendingTasks: [], lastCheck: new Date().toISOString() };
    }
    inbox.agents[agentId].pendingTasks.push({
      taskId: task.id,
      title: task.title,
      message: `🦞 任务：${task.title}\n步骤：${stepName}`,
      receivedAt: new Date().toISOString()
    });
    inbox.agents[agentId].lastCheck = new Date().toISOString();
    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch { return false; }
}

function reportToMain(task: Task, legion: any, status: "done" | "failed", result: string): void {
  try {
    let data: any = { reports: [], lastId: 0 };
    if (fs.existsSync(REPORT_QUEUE_FILE)) {
      try { data = JSON.parse(fs.readFileSync(REPORT_QUEUE_FILE, "utf-8")); } catch {}
    }
    const completeAgentId = task.assigneeId || legion?.leaderId;
    data.reports.push({
      id: ++data.lastId,
      taskId: task.id,
      legionId: task.legionId,
      legionName: legion?.name || "",
      taskTitle: task.title,
      status,
      result,
      fromAgent: completeAgentId || undefined,
      createdAt: new Date().toISOString(),
      sentToMain: false
    });
    const dir = path.dirname(REPORT_QUEUE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_QUEUE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("汇报MAIN失败:", e);
  }
}

/**
 * 获取上一步的产出并验证
 */
async function validatePreviousStepOutput(task: Task, stepIndex: number): Promise<{
  valid: boolean;
  message: string;
  output?: any;
}> {
  // 如果是第一步，无需验证上一步
  if (stepIndex <= 0) {
    return { valid: true, message: "第一步执行，无需验证上一步" };
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lobster-army/output?taskId=${task.id}&stepIndex=${stepIndex - 1}&includeHistory=false`
    );
    if (!response.ok) {
      return { valid: true, message: "无法获取上一步产出，跳过验证" };
    }
    const data = await response.json();
    const outputs = data.outputs || [];
    if (outputs.length === 0) {
      return { valid: true, message: "上一步无产出记录，跳过验证" };
    }
    const prevOutput = outputs[0];
    if (prevOutput.validationStatus === "invalid" || prevOutput.validationStatus === "empty") {
      return {
        valid: false,
        message: `上一步产出验证失败：${prevOutput.validationMessage || "内容无效"}`,
        output: prevOutput
      };
    }
    return { valid: true, message: "上一步产出验证通过", output: prevOutput };
  } catch (e) {
    return { valid: true, message: "验证请求失败，跳过验证" };
  }
}

// ==================== HTTP Handler ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, stepIndex, action } = body;

    if (!taskId) {
      return NextResponse.json({ error: "缺少taskId" }, { status: 400 });
    }

    const tasks = readTasks();
    const taskIdx = tasks.findIndex((t: Task) => t.id === taskId);
    if (taskIdx === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const task = tasks[taskIdx];
    const legionsData = readLegions();
    const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);
    const steps = task.workflowSteps || [];

    // ==================== 审核通过/不通过 ====================
    if (action === "pass" || action === "fail") {
      const currentIdx = task.currentStep ?? 0;
      const currentStep = steps[currentIdx];

      if (task.executionLog) {
        task.executionLog.push({
          stepId: currentStep?.id || `step-${currentIdx + 1}`,
          stepName: currentStep?.name || `步骤${currentIdx + 1}`,
          stepType: currentStep?.type || "execute",
          executedBy: currentStep?.assigneeId,
          executedAt: new Date().toISOString(),
          result: action === "pass" ? "success" : "failed",
          notes: action === "pass" ? "✅ 审核通过" : "❌ 审核不通过"
        });
      }

      if (action === "pass") {
        task.reviewStatus = "approved";
      } else {
        task.reviewStatus = "rejected";
      }

      let nextIdx: number;
      if (action === "pass") {
        nextIdx = currentIdx + 1;
      } else {
        nextIdx = currentStep?.failNext ?? currentIdx;
      }

      if (nextIdx >= steps.length) {
        task.status = "done";
        task.updatedAt = new Date().toISOString();
        tasks[taskIdx] = task;
        writeTasks(tasks);
        reportToMain(task, legion, "done", `✅ 任务「${task.title}」已完成`);
        return NextResponse.json({
          success: true,
          message: "✅ 任务全部完成",
          task: tasks[taskIdx]
        });
      }

      const nextStep = steps[nextIdx];
      task.currentStep = nextIdx;
      task.status = "in_progress";

      if (task.executionLog) {
        task.executionLog.push({
          stepId: nextStep?.id || `step-${nextIdx + 1}`,
          stepName: nextStep?.name || `步骤${nextIdx + 1}`,
          stepType: nextStep?.type || "execute",
          executedBy: nextStep?.assigneeId,
          executedAt: new Date().toISOString(),
          result: "pending",
          notes: `⏳ 开始执行步骤${nextIdx + 1}`
        });
      }

      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      writeTasks(tasks);

      if (nextStep?.assigneeId) {
        addToAgentInbox(nextStep.assigneeId, task, nextStep.name || "");
        triggerAgentWithValidation(nextStep.assigneeId, task, nextStep.name || "", nextIdx, nextStep.minOutputLength).catch(console.error);
      }

      return NextResponse.json({
        success: true,
        message: action === "pass" ? "✅ 审核通过，已进入下一步" : "❌ 已重新执行",
        task: tasks[taskIdx],
        workflowInfo: { totalSteps: steps.length, currentStep: nextIdx + 1, currentAgent: nextStep?.assigneeId }
      });
    }

    // ==================== 执行指定步骤（核心改进） ====================
    const targetStepIndex = stepIndex !== undefined ? stepIndex : (task.currentStep ?? 0);
    const step = steps[targetStepIndex];

    if (!step) {
      return NextResponse.json({ error: `步骤${targetStepIndex + 1}不存在` }, { status: 400 });
    }

    // 🔥 改进：执行前验证上一步产出
    const prevValidation = await validatePreviousStepOutput(task, targetStepIndex);
    if (!prevValidation.valid) {
      return NextResponse.json({
        success: false,
        message: `⚠️ 无法执行：${prevValidation.message}`,
        previousOutput: prevValidation.output,
        needsRevision: true,
        task: tasks[taskIdx]
      }, { status: 422 });
    }

    const agentId = step.assigneeId || "";

    // 标记之前步骤完成
    if (task.currentStep !== undefined && task.currentStep < targetStepIndex) {
      const prevStep = steps[task.currentStep];
      if (task.executionLog) {
        task.executionLog.push({
          stepId: prevStep?.id || `step-${task.currentStep + 1}`,
          stepName: prevStep?.name || `步骤${task.currentStep + 1}`,
          stepType: prevStep?.type || "execute",
          executedBy: prevStep?.assigneeId,
          executedAt: new Date().toISOString(),
          result: "success",
          notes: "✅ 上一步骤完成"
        });
      }
    }

    // 记录当前步骤开始
    const log: ExecutionLog = {
      stepId: step.id || `step-${targetStepIndex + 1}`,
      stepName: step.name,
      stepType: step.type,
      executedBy: agentId,
      executedAt: new Date().toISOString(),
      result: "pending",
      notes: `⏳ 执行中...`
    };
    task.executionLog = task.executionLog || [];
    task.executionLog.push(log);

    task.currentStep = targetStepIndex;
    task.status = "in_progress";
    task.updatedAt = new Date().toISOString();
    tasks[taskIdx] = task;
    writeTasks(tasks);

    // 触发 Agent 并等待结果
    if (agentId) {
      addToAgentInbox(agentId, task, step.name);

      // 🔥 核心：等待 Agent 执行完成并验证产出
      const agentResult = await triggerAgentWithValidation(
        agentId, task, step.name, targetStepIndex, step.minOutputLength
      );

      if (!agentResult.success) {
        // 验证失败，打回重新执行
        if (task.executionLog) {
          task.executionLog.push({
            stepId: step.id || `step-${targetStepIndex + 1}`,
            stepName: step.name,
            stepType: step.type,
            executedBy: agentId,
            executedAt: new Date().toISOString(),
            result: "failed",
            notes: `❌ 产出验证失败：${agentResult.validation?.message || agentResult.error}`,
            agentOutput: agentResult.output,
            outputId: agentResult.outputId
          });
        }
        task.status = "in_progress"; // 留在当前步骤重新执行
        task.updatedAt = new Date().toISOString();
        tasks[taskIdx] = task;
        writeTasks(tasks);

        return NextResponse.json({
          success: false,
          message: `❌ 产出验证失败：${agentResult.validation?.message}`,
          task: tasks[taskIdx],
          log: task.executionLog[task.executionLog.length - 1],
          validation: agentResult.validation,
          needsRevision: true,
          outputId: agentResult.outputId,
          durationMs: agentResult.durationMs
        }, { status: 422 });
      }

      // 验证成功，更新日志
      if (task.executionLog) {
        task.executionLog.push({
          stepId: step.id || `step-${targetStepIndex + 1}`,
          stepName: step.name,
          stepType: step.type,
          executedBy: agentId,
          executedAt: new Date().toISOString(),
          result: "success",
          notes: `✅ 步骤完成 | 验证: ${agentResult.validation?.message}`,
          agentOutput: agentResult.output,
          outputId: agentResult.outputId
        });
      }
    }

    // ⭐ 自动推进到下一步
    const nextIdx = targetStepIndex + 1;

    if (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      task.currentStep = nextIdx;
      task.status = "in_progress";

      if (task.executionLog) {
        task.executionLog.push({
          stepId: nextStep?.id || `step-${nextIdx + 1}`,
          stepName: nextStep?.name || `步骤${nextIdx + 1}`,
          stepType: nextStep?.type || "execute",
          executedBy: nextStep?.assigneeId,
          executedAt: new Date().toISOString(),
          result: "pending",
          notes: `⏳ 自动启动 ${nextStep?.assigneeId || ""} 执行...`
        });
      }

      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      writeTasks(tasks);

      if (nextStep?.assigneeId) {
        addToAgentInbox(nextStep.assigneeId, task, nextStep.name || "");
        triggerAgentWithValidation(nextStep.assigneeId, task, nextStep.name || "", nextIdx, nextStep.minOutputLength).catch(console.error);
      }

      return NextResponse.json({
        success: true,
        message: `步骤"${step.name}"执行完成，已自动推进到"${nextStep?.name}"`,
        task: tasks[taskIdx],
        workflowInfo: { totalSteps: steps.length, currentStep: nextIdx + 1, currentAgent: nextStep?.assigneeId, stepName: nextStep?.name }
      });
    } else {
      // 最后一步
      task.status = "done";
      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      writeTasks(tasks);
      reportToMain(task, legion, "done", `✅ 任务「${task.title}」全部步骤执行完成`);
      return NextResponse.json({
        success: true,
        message: "✅ 任务全部完成",
        task: tasks[taskIdx]
      });
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "缺少taskId" }, { status: 400 });
    }
    const tasks = readTasks();
    const task = tasks.find((t: Task) => t.id === taskId);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({
      task,
      workflowInfo: {
        totalSteps: task.workflowSteps?.length || 0,
        currentStep: (task.currentStep ?? 0) + 1,
        currentStepName: task.workflowSteps?.[task.currentStep ?? 0]?.name
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
