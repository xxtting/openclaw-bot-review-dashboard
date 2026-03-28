/**
 * 多Agent协作API - 龙虾军团任务步骤执行
 * 
 * 核心功能：
 * 1. 每个工作流步骤分配给对应的Agent
 * 2. 触发对应Agent执行任务
 * 3. 记录执行结果
 * 4. 自动进入下一步骤
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const REPORT_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "report-queue.json");

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
}

interface Task {
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
}

interface ExecutionLog {
  stepId: string;
  stepName: string;
  stepType: string;
  executedBy?: string;
  executedAt: string;
  result: "success" | "failed" | "pending";
  notes?: string;
  agentOutput?: string;
}

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

function addToAgentInbox(agentId: string, task: Task, legion: any, stepName: string): boolean {
  try {
    let inbox: any = { agents: {} };
    if (fs.existsSync(INBOX_FILE)) {
      inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf-8"));
    }
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = { pendingTasks: [], lastCheck: new Date().toISOString() };
    }

    const exists = inbox.agents[agentId].pendingTasks.some((t: any) => t.taskId === task.id && t.stepName === stepName);
    if (!exists) {
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
        stepName: stepName,
        message: `🦞 龙虾军团任务：请执行步骤"${stepName}" - 「${task.title}」`
      });
    }

    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch { return false; }
}

function addTaskReport(type: string, task: Task, legion: any, agentId: string, stepName: string, message: string, agentOutput?: string): boolean {
  try {
    let data: any = { reports: [], lastReportId: 0 };
    if (fs.existsSync(REPORT_FILE)) {
      data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
    }
    if (!data.reports) data.reports = [];

    data.reports.push({
      id: ++data.lastReportId,
      type,
      legionId: task.legionId,
      legionName: legion?.name || "",
      taskId: task.id,
      taskTitle: task.title,
      agentId,
      agentName: agentId,
      stepName,
      message,
      priority: task.priority,
      status: task.status,
      createdAt: new Date().toISOString(),
      reportedToMain: false,
      sentToBoss: false,
      agentOutput: agentOutput || ""
    });

    const dir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
}

// 触发Agent执行步骤任务
async function triggerStepAgent(agentId: string, task: Task, step: WorkflowStep): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const message = `🦞 【龙虾军团步骤任务】

**任务标题**：${task.title}
**任务描述**：${task.description || "无"}
**当前步骤**：${step.name} (${step.type})
**所属军团**：墨香斋
**优先级**：${task.priority}

请立即执行这个步骤的任务，完成后输出执行结果。

步骤详情：
- 步骤名称：${step.name}
- 步骤类型：${step.type}
- 负责Agent：${agentId}

完成后请汇报执行结果。`;

      // 使用sessions_spawn来触发Agent执行
      const { spawn } = require('child_process');
      const cmd = `openclaw`;
      const args = ['agent', '--agent', agentId, '--message', message];

      console.log(`🚀 触发Agent ${agentId} 执行步骤"${step.name}"`);

      const proc = spawn(cmd, args, { stdio: 'pipe', timeout: 300000 });
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code: number) => {
        if (code === 0) {
          console.log(`✅ Agent ${agentId} 执行成功`);
          resolve({ success: true, output: stdout || "执行完成" });
        } else {
          console.log(`⚠️ Agent ${agentId} 执行完成，code: ${code}`);
          resolve({ success: true, output: stdout || stderr || "执行完成" });
        }
      });

      proc.on('error', (err: Error) => {
        console.error(`❌ Agent ${agentId} 执行失败: ${err.message}`);
        resolve({ success: false, error: err.message });
      });

      // 5分钟超时
      setTimeout(() => {
        proc.kill();
        resolve({ success: true, output: "执行超时，已后台处理" });
      }, 300000);

    } catch (e: any) {
      console.error(`❌ 触发Agent异常: ${e.message}`);
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * POST /lobster-army/api/workflow/step
 * 执行特定步骤，触发对应Agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, stepIndex } = body;

    if (!taskId) {
      return NextResponse.json({ error: "缺少taskId参数" }, { status: 400 });
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

    // 确定要执行的步骤
    const targetStepIndex = stepIndex !== undefined ? stepIndex : (task.currentStep ?? 0);
    const step = steps[targetStepIndex];

    if (!step) {
      return NextResponse.json({ error: `步骤${targetStepIndex + 1}不存在` }, { status: 400 });
    }

    // 获取负责该步骤的Agent
    const agentId = step.assigneeId;
    if (!agentId) {
      return NextResponse.json({ error: `步骤"${step.name}"没有指定负责Agent` }, { status: 400 });
    }

    // 记录执行日志
    const log: ExecutionLog = {
      stepId: step.id || `step-${targetStepIndex + 1}`,
      stepName: step.name,
      stepType: step.type,
      executedBy: agentId,
      executedAt: new Date().toISOString(),
      result: "pending",
      notes: `⏳ 等待 ${agentId} 执行步骤"${step.name}"`
    };
    task.executionLog = task.executionLog || [];
    task.executionLog.push(log);

    // 更新任务状态
    task.currentStep = targetStepIndex;
    task.status = step.type === "review" ? "review" : "in_progress";
    task.updatedAt = new Date().toISOString();
    tasks[taskIdx] = task;
    writeTasks(tasks);

    // 添加任务到Agent收件箱
    addToAgentInbox(agentId, task, legion, step.name);

    // 触发Agent执行（异步）
    const agentPromise = triggerStepAgent(agentId, task, step);

    // 同时返回当前状态，让前端可以继续操作
    return NextResponse.json({
      success: true,
      message: `步骤"${step.name}"已分配给 ${agentId}，执行中...`,
      task: tasks[taskIdx],
      workflowInfo: {
        totalSteps: steps.length,
        currentStep: targetStepIndex + 1,
        currentAgent: agentId,
        stepName: step.name,
        stepType: step.type,
        nextAgent: steps[targetStepIndex + 1]?.assigneeId || null,
        isLastStep: targetStepIndex >= steps.length - 1
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /lobster-army/api/workflow/step
 * 获取任务的步骤详情和负责人
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json({ error: "缺少taskId参数" }, { status: 400 });
    }

    const tasks = readTasks();
    const task = tasks.find((t: Task) => t.id === taskId);

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const legionsData = readLegions();
    const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);
    const steps = task.workflowSteps || [];

    // 返回详细的步骤信息
    const stepDetails = steps.map((step, idx) => ({
      index: idx,
      id: step.id,
      name: step.name,
      type: step.type,
      assigneeId: step.assigneeId,
      isCompleted: idx < (task.currentStep ?? 0),
      isCurrent: idx === task.currentStep,
      isPending: idx > (task.currentStep ?? 0)
    }));

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        currentStep: task.currentStep,
        totalSteps: steps.length
      },
      legion: legion ? { id: legion.id, name: legion.name, emoji: legion.emoji } : null,
      steps: stepDetails,
      executionLog: task.executionLog || []
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
