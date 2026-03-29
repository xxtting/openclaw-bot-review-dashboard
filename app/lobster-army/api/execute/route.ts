/**
 * 龙虾军团 - 任务执行 API
 * 
 * 改进点：
 * 1. 实质性执行：Agent 必须真正执行任务并产出内容
 * 2. 产出验证：每个 Agent 执行后验证产出是否符合要求
 * 3. 工作成果管理：记录每个 Agent 的实际产出
 * 4. 实质性汇报：汇报内容包含完整工作成果
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const DISPATCH_FILE = path.join(OPENCLAW_HOME, "lobster-dispatch-queue.json");
const REPORT_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "main-report-queue.json");

// 最小有效产出长度
const MIN_OUTPUT_LENGTH = 50;

export interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
  conditionType?: "none" | "pass" | "fail";
  failNext?: number | null;
  feedbackAgentId?: string;
  /** 产出最小长度要求（字节），默认 50 */
  minOutputLength?: number;
}

export interface StepOutput {
  id: string;
  stepIndex: number;
  stepName: string;
  agentId: string;
  content: string;
  validationStatus: "pending" | "valid" | "invalid" | "empty";
  validationMessage?: string;
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
  fromBoss?: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  executionLog?: ExecutionLog[];
  executionResult?: string;
  /** 每个步骤的实际产出 */
  outputs?: StepOutput[];
  /** 任务整体审核状态 */
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
  outputId?: string;       // 关联的产出记录ID
}

type ReportType = "task_started" | "task_completed" | "task_failed" | "step_executed" | "step_approved" | "step_rejected";

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

// ==================== 产出管理 ====================

interface OutputStoreResult {
  success: boolean;
  outputId?: string;
  validationStatus?: string;
  validationMessage?: string;
  error?: string;
}

/**
 * 存储 Agent 产出到产出管理系统
 */
async function storeOutput(
  taskId: string,
  stepIndex: number,
  stepId: string,
  stepName: string,
  agentId: string,
  agentName: string | undefined,
  content: string,
  executionDurationMs?: number
): Promise<OutputStoreResult> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lobster-army/output`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          stepIndex,
          stepId,
          stepName,
          agentId,
          agentName,
          content,
          executionDurationMs
        })
      }
    );
    
    if (!response.ok) {
      const err = await response.json();
      return { success: false, error: err.error || "存储产出失败" };
    }
    
    const data = await response.json();
    return {
      success: true,
      outputId: data.output?.id,
      validationStatus: data.validation?.status,
      validationMessage: data.validation?.message
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 获取任务的所有产出
 */
async function getTaskOutputs(taskId: string): Promise<StepOutput[]> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lobster-army/output?taskId=${taskId}&includeHistory=false`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.outputs || [];
  } catch { return []; }
}

/**
 * 验证产出内容是否有效
 */
function validateAgentOutput(content: string, minLength: number = MIN_OUTPUT_LENGTH): {
  valid: boolean;
  message: string;
  details: { length: number; minRequired: number; lines: number }
} {
  if (!content || content.trim().length === 0) {
    return { valid: false, message: "产出为空", details: { length: 0, minRequired: minLength, lines: 0 } };
  }
  
  const trimmed = content.trim();
  const length = Buffer.byteLength(trimmed, "utf-8");
  const lines = trimmed.split("\n").length;
  
  // 敷衍内容检测
  const lowQualityPatterns = [
    /^收到$/i, /^完成$/i, /^好的$/i, /^OK$/i, /^done$/i,
    /^已执行$/i, /^执行完成$/i, /^任务完成$/i,
    /^正在处理$/i, /^处理中$/i
  ];
  
  for (const pattern of lowQualityPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, message: "疑似敷衍内容（仅简单回复）", details: { length, minRequired: minLength, lines } };
    }
  }
  
  if (length < minLength) {
    return { valid: false, message: `内容过短（${length}字节，要求${minLength}字节）`, details: { length, minRequired: minLength, lines } };
  }
  
  return { valid: true, message: `验证通过（${length}字节，${lines}行）`, details: { length, minRequired: minLength, lines } };
}

// ==================== Agent 执行（核心改进） ====================

/**
 * 触发 OpenClaw Agent 实质性执行任务
 * 
 * 改进点：
 * 1. 传入输出文件路径，Agent 将结果写入文件
 * 2. 等待执行完成
 * 3. 读取并验证输出内容
 * 4. 返回验证结果
 */
async function triggerOpenClawAgent(
  agentId: string,
  task: Task,
  stepName?: string,
  stepIndex?: number,
  outputPath?: string
): Promise<{
  success: boolean;
  output?: string;
  outputPath?: string;
  validation?: { valid: boolean; message: string; details: any };
  error?: string;
  durationMs?: number;
}> {
  const startTime = Date.now();
  
  // 如果没有指定输出文件，则生成一个
  if (!outputPath) {
    const outputDir = path.join(OPENCLAW_HOME, "lobster-agent-outputs");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    outputPath = path.join(outputDir, `${task.id}-step${stepIndex ?? 0}-${Date.now()}.txt`);
  }
  
  try {
    // 构建发给 Agent 的消息 - 明确要求将结果写入文件
    const message = `🦞【龙虾军团任务】

任务标题：${task.title}
${task.description ? `\n任务描述：${task.description}` : ""}
${stepName ? `\n当前执行步骤：${stepName}` : ""}
${stepIndex !== undefined ? `\n步骤索引：${stepIndex}` : ""}

🔥【重要】请务必完成以下工作：

1. 认真理解任务要求
2. 实质性执行任务（编写代码、分析数据、创作内容等）
3. 将你的完整执行结果写入输出文件：${outputPath}
4. 输出内容必须包含：
   - 具体做了什么
   - 实际产出内容（代码/分析结果/创作内容等）
   - 遇到的问题及解决方案
   - 是否完成

⚠️ 禁止仅回复"收到"、"完成"等敷衍内容，必须输出实质性工作成果！`;

    // 使用 execSync 同步执行，等待完整结果
    const safeMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const command = `openclaw agent --agent "${agentId}" --message "${safeMessage}" --timeout 300 --json`;
    
    console.log(`🚀 [${new Date().toISOString()}] 触发Agent: ${agentId}`);
    console.log(`📋 任务: ${task.title} | 步骤: ${stepName}`);
    console.log(`📄 输出文件: ${outputPath}`);

    let result: string = "";
    try {
      result = execSync(command, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (e: any) {
      // execSync 在超时或错误时会抛出异常，但 stdout 可能仍有内容
      if (e.stdout) result += e.stdout;
      if (e.stderr) result += e.stderr;
      console.warn(`⚠️ Agent CLI 执行有错误: ${e.message}`);
    }

    // 过滤日志噪声
    const filteredOutput = filterAgentOutput(result);
    
    // 尝试读取 Agent 写入的输出文件
    let fileContent = "";
    if (fs.existsSync(outputPath)) {
      try {
        fileContent = fs.readFileSync(outputPath, "utf-8");
        console.log(`📄 已读取输出文件（${fileContent.length}字符）`);
      } catch (e) {
        console.warn(`⚠️ 读取输出文件失败: ${e}`);
      }
    }

    // 优先使用文件内容，否则用 CLI 输出
    const finalOutput = fileContent.trim() || filteredOutput.trim();
    
    // 验证产出
    const stepMinLength = task.workflowSteps?.[stepIndex ?? 0]?.minOutputLength ?? MIN_OUTPUT_LENGTH;
    const validation = validateAgentOutput(finalOutput, stepMinLength);
    
    const durationMs = Date.now() - startTime;
    console.log(`✅ [${new Date().toISOString()}] Agent执行完成，耗时${durationMs}ms`);
    console.log(`📊 验证结果: ${validation.valid ? "通过" : "失败"} - ${validation.message}`);
    
    return {
      success: validation.valid,
      output: finalOutput,
      outputPath,
      validation,
      durationMs
    };

  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    console.error(`❌ Agent执行异常: ${e.message}`);
    return {
      success: false,
      error: e.message,
      durationMs
    };
  }
}

/**
 * 过滤 Agent 输出中的插件注册日志等噪声
 */
function filterAgentOutput(output: string): string {
  if (!output) return "";
  
  const lines = output.split("\n");
  const filtered: string[] = [];
  let inRealOutput = false;
  
  for (const line of lines) {
    // 跳过插件注册行
    if (
      line.startsWith("[plugins]") ||
      line.includes("Registered feishu_") ||
      line.includes("Registered ") ||
      line.startsWith("🦞") && !line.includes("龙虾军团任务")
    ) {
      continue;
    }
    
    // 跳过空行直到遇到真实内容
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

// ==================== 收件箱 & 队列 ====================

function addToAgentInbox(agentId: string, task: Task, legion: any, action: string, stepName?: string): boolean {
  try {
    let inbox: any = { agents: {} };
    if (fs.existsSync(INBOX_FILE)) {
      inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf-8"));
    }
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = { pendingTasks: [], lastCheck: new Date().toISOString() };
    }
    
    const exists = inbox.agents[agentId].pendingTasks.some((t: any) => t.taskId === task.id);
    if (!exists) {
      const message = action === "start"
        ? `🦞 新任务：请开始执行「${task.title}」`
        : action === "execute"
        ? `⚡ 执行步骤：${stepName || "执行中"} - 「${task.title}」`
        : `📋 任务更新 - 「${task.title}」`;
      
      inbox.agents[agentId].pendingTasks.push({
        id: `inbox-${Date.now()}`,
        taskId: task.id,
        title: task.title,
        description: task.description,
        legionId: task.legionId,
        legionName: legion?.name || "",
        priority: task.priority,
        status: "pending",
        createdAt: new Date().toISOString(),
        message
      });
    }
    
    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch (e) {
    console.error("添加收件箱失败:", e);
    return false;
  }
}

function addToDispatchQueue(agentId: string, task: Task, action: string, result: string): boolean {
  try {
    let queue: any[] = [];
    if (fs.existsSync(DISPATCH_FILE)) {
      queue = JSON.parse(fs.readFileSync(DISPATCH_FILE, "utf-8"));
    }
    
    queue.push({
      id: `dispatch-${Date.now()}`,
      agentId,
      taskId: task.id,
      taskTitle: task.title,
      action,
      result,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    
    const dir = path.dirname(DISPATCH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISPATCH_FILE, JSON.stringify(queue, null, 2));
    return true;
  } catch (e) {
    console.error("添加分发队列失败:", e);
    return false;
  }
}

function addTaskReport(
  type: ReportType,
  task: Task,
  legion: any,
  agentId: string,
  stepName?: string,
  message?: string,
  agentOutput?: string
): boolean {
  try {
    const REPORT_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "report-queue.json");
    let data: any = { reports: [], lastReportId: 0 };

    if (fs.existsSync(REPORT_FILE)) {
      data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
    }

    if (!data.reports) data.reports = [];
    if (!data.lastReportId) data.lastReportId = 0;

    data.reports.push({
      id: ++data.lastReportId,
      type,
      legionId: task.legionId,
      legionName: legion?.name || "",
      taskId: task.id,
      taskTitle: task.title,
      agentId,
      agentName: agentId,
      stepName: stepName || "",
      message: message || `${type}: ${task.title}`,
      priority: task.priority,
      status: task.status,
      createdAt: new Date().toISOString(),
      reportedToMain: false,
      sentToBoss: false,
      agentOutput: agentOutput || null
    });

    const dir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data, null, 2));

    return true;
  } catch (e) {
    console.error("添加汇报失败:", e);
    return false;
  }
}

async function reportToMain(task: Task, legion: any, status: "done" | "failed", result: string, agentOutputs?: StepOutput[]) {
  try {
    const REPORT_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "main-report-queue.json");
    let data: any = { reports: [], lastId: 0 };
    try {
      if (fs.existsSync(REPORT_QUEUE_FILE)) {
        data = JSON.parse(fs.readFileSync(REPORT_QUEUE_FILE, "utf-8"));
      }
    } catch {}

    const completeAgentId = task.assigneeId || legion?.leaderId;
    const reportEntry = {
      id: ++data.lastId,
      taskId: task.id,
      legionId: task.legionId,
      legionName: legion?.name || "",
      taskTitle: task.title,
      status,
      result,
      agentOutputs: agentOutputs || undefined,
      fromAgent: completeAgentId || undefined,
      createdAt: new Date().toISOString(),
      sentToMain: false
    };
    data.reports.push(reportEntry);

    const dir = path.dirname(REPORT_QUEUE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_QUEUE_FILE, JSON.stringify(data, null, 2));

    console.log(`📝 任务汇报已记录: [${status}] ${task.title}`);
    return { success: true };
  } catch (e) {
    console.error("汇报MAIN失败:", e);
    return { success: false };
  }
}

// ==================== 步骤执行 ====================

async function executeStep(
  task: Task,
  stepIndex: number,
  agentId?: string
): Promise<{
  success: boolean;
  message: string;
  result?: any;
  agentOutput?: string;
  outputId?: string;
  validation?: any;
  durationMs?: number;
}> {
  const steps = task.workflowSteps || [];
  const step = steps[stepIndex];

  if (!step) {
    return { success: false, message: `步骤 ${stepIndex + 1} 不存在` };
  }

  const STEP_HANDLERS: Record<string, (task: Task, step: WorkflowStep, aId?: string) => Promise<any>> = {
    execute: async (t, s, aId) => {
      if (aId) {
        console.log(`⚡ 开始执行 Agent: ${aId}，步骤: ${s?.name}`);
        
        // 🔥 核心改进：触发 Agent 并等待完整执行 + 验证产出
        const agentResult = await triggerOpenClawAgent(aId, t, s?.name, stepIndex);
        
        if (agentResult.success) {
          // 存储产出
          const storeResult = await storeOutput(
            t.id,
            stepIndex,
            s?.id || `step-${stepIndex + 1}`,
            s?.name || `步骤${stepIndex + 1}`,
            aId,
            undefined,
            agentResult.output || "",
            agentResult.durationMs
          );
          
          return {
            success: true,
            message: `✅ Agent[${aId}] 执行完成：${t.title}`,
            result: { newStatus: "in_progress" },
            agentOutput: agentResult.output,
            outputId: storeResult.outputId,
            validation: agentResult.validation,
            durationMs: agentResult.durationMs
          };
        } else {
          return {
            success: false,
            message: `❌ Agent[${aId}] 执行失败：${agentResult.error || agentResult.validation?.message}`,
            result: { newStatus: "in_progress" },
            agentOutput: agentResult.output,
            validation: agentResult.validation,
            durationMs: agentResult.durationMs
          };
        }
      }
      
      return {
        success: true,
        message: `⚡ 执行中：${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    review: async (t, s) => {
      return {
        success: true,
        message: `👀 待审核：${t.title}`,
        result: { newStatus: "review" }
      };
    },
    test: async (t, s) => {
      return {
        success: true,
        message: `🧪 测试中：${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    deploy: async (t, s) => {
      return {
        success: true,
        message: `🚀 部署中：${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    archive: async (t, s) => {
      return {
        success: true,
        message: `📦 已存档：${t.title}`,
        result: { newStatus: "archived" }
      };
    }
  };

  const handler = STEP_HANDLERS[step.type];
  if (!handler) {
    return { success: false, message: `未知的步骤类型: ${step.type}` };
  }

  return handler(task, step, agentId);
}

// ==================== HTTP Handlers ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, stepIndex, action } = body;

    const tasks = readTasks();
    const taskIdx = tasks.findIndex((t: Task) => t.id === taskId);

    if (taskIdx === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const task = tasks[taskIdx];
    const legionsData = readLegions();
    const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);
    
    const defaultSteps: WorkflowStep[] = [
      { id: "step-1", name: "执行", type: "execute", assigneeId: task.assigneeId },
      { id: "step-2", name: "审核", type: "review" },
      { id: "step-3", name: "存档", type: "archive" },
    ];

    if (!task.workflowSteps || task.workflowSteps.length === 0) {
      task.workflowSteps = legion?.workflowSteps || defaultSteps;
    }

    if (task.currentStep === undefined) {
      task.currentStep = 0;
    }

    // ==================== 执行步骤 ====================
    if (action === "next" || action === "execute") {
      const targetStep = stepIndex !== undefined ? stepIndex : task.currentStep ?? 0;
      const steps = task.workflowSteps || [];
      const stepInfo = steps[targetStep];
      const agentId = stepInfo?.assigneeId || task.assigneeId || legion?.leaderId;
      
      const result = await executeStep(task, targetStep, agentId);

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      // 记录执行日志（包含产出ID和验证结果）
      const log: ExecutionLog = {
        stepId: stepInfo?.id || `step-${targetStep + 1}`,
        stepName: stepInfo?.name || `步骤${targetStep + 1}`,
        stepType: stepInfo?.type || "execute",
        executedAt: new Date().toISOString(),
        result: result.validation?.valid !== false ? "success" : "failed",
        notes: result.message + (result.validation ? ` | 验证: ${result.validation.message}` : ""),
        agentOutput: result.agentOutput,
        outputId: result.outputId
      };

      // 更新任务
      task.status = result.result?.newStatus || task.status;
      task.currentStep = targetStep + 1;
      task.updatedAt = new Date().toISOString();
      task.executedAt = new Date().toISOString();
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.executionResult = result.agentOutput;

      // 如果验证失败，打回重新执行
      if (result.validation?.valid === false) {
        console.warn(`⚠️ 步骤${targetStep + 1}产出验证失败，打回重做`);
        task.status = "in_progress";
        task.currentStep = targetStep; // 留在当前步骤
        
        addTaskReport(
          "step_rejected",
          task,
          legion,
          agentId || "system",
          stepInfo?.name,
          `❌ 产出验证失败：${result.validation.message}，请重新执行`
        );
        
        tasks[taskIdx] = task;
        writeTasks(tasks);
        
        return NextResponse.json({
          success: false,
          message: `❌ 产出验证失败：${result.validation.message}`,
          task: tasks[taskIdx],
          log,
          validation: result.validation,
          needsRevision: true,
          outputId: result.outputId
        }, { status: 422 });
      }

      if ((task.currentStep ?? 0) >= (task.workflowSteps?.length || 0)) {
        task.status = "done";
      }

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      addTaskReport("step_executed", task, legion, agentId || "system", stepInfo?.name, result.message, result.agentOutput);

      return NextResponse.json({
        success: true,
        message: result.message,
        task: tasks[taskIdx],
        log,
        agentOutput: result.agentOutput,
        outputId: result.outputId,
        validation: result.validation,
        durationMs: result.durationMs
      });

    // ==================== 开始任务 ====================
    } else if (action === "start") {
      task.status = "in_progress";
      task.currentStep = 0;
      task.updatedAt = new Date().toISOString();
      (task as any).startedAt = new Date().toISOString();
      task.outputs = [];

      const steps = task.workflowSteps || [];
      const agentId = task.assigneeId || legion?.leaderId;
      
      const log: ExecutionLog = {
        stepId: steps[0]?.id || "step-1",
        stepName: steps[0]?.name || "开始",
        stepType: steps[0]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: `🚀 任务开始：${task.title}`
      };
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      let agentResult: any;
      if (agentId) {
        addToAgentInbox(agentId, task, legion, "start");
        addToDispatchQueue(agentId, task, "start", "任务已开始");
        
        // 🔥 启动时触发 Agent
        agentResult = await triggerOpenClawAgent(agentId, task, steps[0]?.name, 0);
        
        addTaskReport("task_started", task, legion, agentId, steps[0]?.name,
          agentResult.success ? "🚀 任务已开始，Agent执行中" : "🚀 任务已开始",
          agentResult.output
        );

        // 如果有后续步骤，自动推进
        if (steps.length > 1) {
          const nextStepIdx = 1;
          const nextStep = steps[nextStepIdx];
          const nextAgentId = nextStep?.assigneeId || agentId;
          
          task.currentStep = nextStepIdx;
          task.status = "in_progress";
          
          task.executionLog.push({
            stepId: steps[0]?.id || "step-1",
            stepName: steps[0]?.name || "步骤1",
            stepType: steps[0]?.type || "execute",
            executedBy: agentId,
            executedAt: new Date().toISOString(),
            result: "success",
            notes: "✅ 步骤完成，自动进入下一步"
          });
          
          if (task.executionLog) {
            task.executionLog.push({
              stepId: nextStep?.id || `step-${nextStepIdx + 1}`,
              stepName: nextStep?.name || `步骤${nextStepIdx + 1}`,
              stepType: nextStep?.type || "execute",
              executedBy: nextAgentId,
              executedAt: new Date().toISOString(),
              result: "pending",
              notes: `⏳ 自动启动 ${nextAgentId} 执行...`
            });
          }
          
          task.updatedAt = new Date().toISOString();
          tasks[taskIdx] = task;
          writeTasks(tasks);
          
          if (nextAgentId) {
            addToAgentInbox(nextAgentId, task, legion, "start", nextStep?.name);
            addToDispatchQueue(nextAgentId, task, "start", `步骤"${nextStep?.name}"已分配`);
            triggerOpenClawAgent(nextAgentId, task, nextStep?.name, nextStepIdx).catch(console.error);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: "任务已开始",
        task: tasks[taskIdx],
        notified: agentId || null,
        reported: true,
        agentOutput: agentResult?.output,
        outputId: agentResult?.outputId,
        validation: agentResult?.validation
      });

    // ==================== 完成任务 ====================
    } else if (action === "complete") {
      task.status = "done";
      task.currentStep = task.workflowSteps?.length || 0;
      task.updatedAt = new Date().toISOString();
      (task as any).completedAt = new Date().toISOString();
      task.reviewStatus = task.reviewStatus || "approved";

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      const completeAgentId = task.assigneeId || legion?.leaderId;
      addTaskReport("task_completed", task, legion, completeAgentId || "system", "完成", "✅ 任务已完成");

      // 🔥 汇报给 MAIN（包含完整产出）
      const outputs = await getTaskOutputs(task.id);
      reportToMain(task, legion, "done", `✅ 任务「${task.title}」已完成`, outputs).catch(console.error);

      return NextResponse.json({
        success: true,
        message: "任务已完成",
        task: tasks[taskIdx],
        reported: true,
        outputs
      });

    // ==================== 审核通过 ====================
    } else if (action === "approve") {
      const steps = task.workflowSteps || [];
      const currentStepIdx = task.currentStep ?? 0;
      const currentStep = steps[currentStepIdx];

      const log: ExecutionLog = {
        stepId: currentStep?.id || `step-${currentStepIdx + 1}`,
        stepName: currentStep?.name || `步骤${currentStepIdx + 1}`,
        stepType: currentStep?.type || "review",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: `✅ 审核通过：${body.notes || "通过"}`
      };

      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.reviewStatus = "approved";

      const nextStepIdx = currentStepIdx + 1;
      if (nextStepIdx >= steps.length) {
        task.status = "done";
        task.currentStep = steps.length;
        const outputs = await getTaskOutputs(task.id);
        reportToMain(task, legion, "done", `✅ 任务「${task.title}」审核通过，全部步骤完成`, outputs).catch(console.error);
      } else {
        task.currentStep = nextStepIdx;
        task.status = "in_progress";
        const nextStep = steps[nextStepIdx];
        const nextAgentId = nextStep?.assigneeId;
        if (nextAgentId) {
          addToAgentInbox(nextAgentId, task, legion, "start", nextStep?.name);
          addToDispatchQueue(nextAgentId, task, "approve", `步骤"${nextStep?.name}"已分配`);
          triggerOpenClawAgent(nextAgentId, task, nextStep?.name, nextStepIdx).catch(console.error);
        }
      }

      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      addTaskReport("step_approved", task, legion, currentStep?.assigneeId || "system", currentStep?.name, "✅ 审核通过");

      return NextResponse.json({
        success: true,
        message: `✅ 审核通过${nextStepIdx < steps.length ? `，已进入步骤${nextStepIdx + 1}` : "，任务完成"}`,
        task: tasks[taskIdx],
        branchAction: "approved",
        nextStep: nextStepIdx < steps.length ? nextStepIdx + 1 : null
      });

    // ==================== 审核拒绝 ====================
    } else if (action === "reject") {
      const steps = task.workflowSteps || [];
      const currentStepIdx = task.currentStep ?? 0;
      const currentStep = steps[currentStepIdx];
      
      const feedbackAgentId = currentStep?.feedbackAgentId || currentStep?.assigneeId || "";
      const feedbackNote = feedbackAgentId
        ? `❌ 审核不通过，反馈给 ${feedbackAgentId} 修正`
        : `❌ 审核不通过，返回步骤${currentStepIdx + 1}重新执行`;

      const log: ExecutionLog = {
        stepId: currentStep?.id || `step-${currentStepIdx + 1}`,
        stepName: currentStep?.name || `步骤${currentStepIdx + 1}`,
        stepType: currentStep?.type || "review",
        executedAt: new Date().toISOString(),
        result: "failed",
        notes: `❌ 审核不通过：${body.notes || "未通过"}，${feedbackNote}`
      };

      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.reviewStatus = "rejected";

      if (currentStep?.feedbackAgentId) {
        task.currentStep = currentStepIdx;
        task.status = "in_progress";
        
        addToAgentInbox(feedbackAgentId, task, legion, "feedback", currentStep?.name || `步骤${currentStepIdx + 1}`);
        addToDispatchQueue(feedbackAgentId, task, "reject", `❌ 审核不通过：${body.notes || "未通过"}，请修正后重新提交`);
        triggerOpenClawAgent(feedbackAgentId, task, `修正任务：${currentStep?.name || ""}`).catch(console.error);
        
        tasks[taskIdx] = task;
        if (!writeTasks(tasks)) {
          return NextResponse.json({ error: "保存失败" }, { status: 500 });
        }
        
        addTaskReport("step_rejected", task, legion, feedbackAgentId, currentStep?.name || "", feedbackNote);
        
        return NextResponse.json({
          success: true,
          message: feedbackNote,
          task: tasks[taskIdx],
          branchAction: "feedback",
          feedbackTo: feedbackAgentId
        });
      } else {
        let failNextIdx = currentStep?.failNext ?? null;
        if (failNextIdx === null || failNextIdx === undefined) {
          failNextIdx = currentStepIdx;
        }

        task.currentStep = failNextIdx;
        task.status = "in_progress";
        task.updatedAt = new Date().toISOString();

        const failStep = steps[failNextIdx];
        const failAgentId = failStep?.assigneeId;
        if (failAgentId) {
          addToAgentInbox(failAgentId, task, legion, "restart", failStep?.name);
          addToDispatchQueue(failAgentId, task, "reject", `步骤"${failStep?.name}"需要重新执行`);
          triggerOpenClawAgent(failAgentId, task, failStep?.name, failNextIdx).catch(console.error);
        }

        tasks[taskIdx] = task;
        if (!writeTasks(tasks)) {
          return NextResponse.json({ error: "保存失败" }, { status: 500 });
        }

        addTaskReport("step_rejected", task, legion, currentStep?.assigneeId || "system", currentStep?.name, `❌ 审核不通过，返回步骤${failNextIdx + 1}重新执行`);

        return NextResponse.json({
          success: true,
          message: `❌ 审核不通过，已返回步骤${failNextIdx + 1}重新执行`,
          task: tasks[taskIdx],
          branchAction: "rejected",
          jumpToStep: failNextIdx
        });
      }

    // ==================== 失败标记 ====================
    } else if (action === "fail") {
      const targetStep = stepIndex !== undefined ? stepIndex : (task.currentStep ?? 0);
      const steps = task.workflowSteps || [];

      const log: ExecutionLog = {
        stepId: steps[targetStep]?.id || `step-${targetStep + 1}`,
        stepName: steps[targetStep]?.name || `步骤${targetStep + 1}`,
        stepType: steps[targetStep]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "failed",
        notes: body.notes || "执行失败"
      };
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.updatedAt = new Date().toISOString();

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      const failAgentId = task.assigneeId || legion?.leaderId;
      addTaskReport("task_failed", task, legion, failAgentId || "system", steps[targetStep]?.name, `❌ 任务失败：${body.notes || "未知原因"}`);

      return NextResponse.json({
        success: true,
        message: "步骤执行失败",
        task: tasks[taskIdx],
        log,
        reported: true
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    const tasks = readTasks();

    if (taskId) {
      const task = tasks.find((t: Task) => t.id === taskId);
      if (!task) {
        return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    const allLogs = tasks
      .filter((t: Task) => t.executionLog && t.executionLog.length > 0)
      .flatMap((t: Task) => (t.executionLog || []).map((log: ExecutionLog) => ({
        ...log,
        taskId: t.id,
        taskTitle: t.title
      })));

    return NextResponse.json({ logs: allLogs.reverse() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
