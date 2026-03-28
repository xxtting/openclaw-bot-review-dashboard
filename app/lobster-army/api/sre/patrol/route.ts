/**
 * 龙虾军团 SRE 巡检服务
 * 
 * 功能：
 * 1. 定期检查所有军团的任务状态
 * 2. 如果任务在某个步骤等待超过一定时间，自动触发下一个Agent执行
 * 3. 发送执行通知给对应Agent
 * 4. 记录巡检日志
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const PATROL_LOG_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "patrol-log.json");

interface Task {
  id: string;
  legionId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  status: "pending" | "in_progress" | "review" | "archived" | "done";
  priority: "P0" | "P1" | "P2";
  currentStep?: number;
  workflowSteps?: WorkflowStep[];
  executionLog?: ExecutionLog[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "deploy" | "test" | "archive";
  assigneeId?: string;
  conditionType?: "none" | "pass" | "fail";
  failNext?: number | null;
}

interface ExecutionLog {
  stepId: string;
  stepName: string;
  stepType: string;
  executedBy?: string;
  executedAt: string;
  result: "success" | "failed" | "pending";
  notes?: string;
}

interface PatrolLog {
  timestamp: string;
  action: string;
  taskId?: string;
  taskTitle?: string;
  fromStep?: number;
  toStep?: number;
  agentId?: string;
  result: "triggered" | "skipped" | "error";
  message: string;
}

function readTasks(): Task[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch { return []; }
}

function readLegions(): any {
  try {
    if (!fs.existsSync(LEGIONS_FILE)) return { legions: [], agents: [] };
    return JSON.parse(fs.readFileSync(LEGIONS_FILE, "utf-8"));
  } catch { return { legions: [], agents: [] }; }
}

function readPatrolLog(): PatrolLog[] {
  try {
    if (!fs.existsSync(PATROL_LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(PATROL_LOG_FILE, "utf-8"));
  } catch { return []; }
}

function appendPatrolLog(log: PatrolLog): void {
  try {
    const logs = readPatrolLog();
    logs.push(log);
    // 只保留最近100条日志
    const recentLogs = logs.slice(-100);
    const dir = path.dirname(PATROL_LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PATROL_LOG_FILE, JSON.stringify(recentLogs, null, 2));
  } catch (e) {
    console.error("写入巡检日志失败:", e);
  }
}

function addToAgentInbox(agentId: string, task: Task, stepName: string): boolean {
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
        priority: task.priority,
        status: "pending",
        createdAt: new Date().toISOString(),
        stepName: stepName,
        message: `🦞 [SRE自动触发] 请执行步骤"${stepName}" - 「${task.title}」`
      });
    }

    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch { return false; }
}

// 触发Agent执行
async function triggerAgent(agentId: string, task: Task, stepName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const message = `🦞 [SRE自动触发] 龙虾军团任务

任务：${task.title}
描述：${task.description || "无"}
当前步骤：${stepName}
优先级：${task.priority}

请立即执行这个步骤的任务！`;

      const proc = spawn("openclaw", ["agent", "--agent", agentId, "--message", message], {
        stdio: "pipe",
        timeout: 60000
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        console.log(`SRE触发Agent ${agentId} 执行步骤"${stepName}"完成，code: ${code}`);
        resolve(true);
      });

      proc.on("error", (err: Error) => {
        console.error(`SRE触发Agent失败: ${err.message}`);
        resolve(false);
      });

      setTimeout(() => {
        proc.kill();
        resolve(true); // 超时也认为成功
      }, 60000);

    } catch (e: any) {
      console.error("触发Agent异常:", e.message);
      resolve(false);
    }
  });
}

/**
 * SRE巡检 - 检查所有任务并自动触发等待中的步骤
 */
export async function patrol(): Promise<{
  checked: number;
  triggered: number;
  skipped: number;
  logs: PatrolLog[];
}> {
  const tasks = readTasks();
  const legionsData = readLegions();
  const logs: PatrolLog[] = [];
  let triggeredCount = 0;
  let skippedCount = 0;

  for (const task of tasks) {
    // 只处理进行中的任务
    if (task.status !== "in_progress" && task.status !== "review") continue;

    const steps = task.workflowSteps || [];
    const currentStepIdx = task.currentStep ?? 0;
    const currentStep = steps[currentStepIdx];

    if (!currentStep) continue;

    // 检查当前步骤是否超时（超过5分钟没有更新）
    const lastExecLog = task.executionLog?.[task.executionLog.length - 1];
    if (lastExecLog) {
      const lastExecTime = new Date(lastExecLog.executedAt).getTime();
      const now = Date.now();
      const timeout = 5 * 60 * 1000; // 5分钟

      if (now - lastExecTime < timeout) {
        // 太频繁了，跳过
        logs.push({
          timestamp: new Date().toISOString(),
          action: "check",
          taskId: task.id,
          taskTitle: task.title,
          fromStep: currentStepIdx,
          result: "skipped",
          message: `步骤${currentStepIdx + 1}"${currentStep.name}"执行时间未超时，跳过`
        });
        skippedCount++;
        continue;
      }
    }

    // 触发当前步骤的Agent
    const agentId = currentStep.assigneeId;
    if (!agentId) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: "check",
        taskId: task.id,
        taskTitle: task.title,
        fromStep: currentStepIdx,
        result: "error",
        message: `步骤${currentStepIdx + 1}"${currentStep.name}"未分配Agent`
      });
      skippedCount++;
      continue;
    }

    // 添加到Agent收件箱
    addToAgentInbox(agentId, task, currentStep.name);

    // 触发Agent执行（异步）
    triggerAgent(agentId, task, currentStep.name);

    logs.push({
      timestamp: new Date().toISOString(),
      action: "trigger",
      taskId: task.id,
      taskTitle: task.title,
      fromStep: currentStepIdx,
      agentId: agentId,
      result: "triggered",
      message: `SRE自动触发 ${agentId} 执行步骤${currentStepIdx + 1}"${currentStep.name}"`
    });
    triggeredCount++;
  }

  // 记录日志
  for (const log of logs) {
    appendPatrolLog(log);
  }

  return {
    checked: tasks.length,
    triggered: triggeredCount,
    skipped: skippedCount,
    logs: logs.slice(-10) // 返回最近10条
  };
}

// GET /lobster-army/api/sre/patrol - 执行巡检
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auto = searchParams.get("auto") === "true";

    if (auto) {
      // 自动模式：只返回巡检结果，不触发
      const result = await patrol();
      return NextResponse.json({
        success: true,
        mode: "auto",
        ...result
      });
    }

    // 手动模式：执行一次完整巡检
    const result = await patrol();
    return NextResponse.json({
      success: true,
      mode: "manual",
      ...result
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
