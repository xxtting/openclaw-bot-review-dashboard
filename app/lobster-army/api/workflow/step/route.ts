/**
 * 多Agent协作API - 龙虾军团任务步骤执行
 * 核心：执行步骤后同步自动推进到下一步
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

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
  requireManualApproval?: boolean;
  failNext?: number;
}

interface Task {
  id: string;
  legionId: string;
  title: string;
  description?: string;
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

function addToAgentInbox(agentId: string, task: Task, stepName: string): boolean {
  try {
    let inbox = { agents: {} };
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
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch { return false; }
}

function reportToMain(task: Task, legion: any, status: "done" | "failed", result: string): void {
  try {
    let data: any = { reports: [], lastId: 0 };
    try {
      if (fs.existsSync(REPORT_QUEUE_FILE)) {
        data = JSON.parse(fs.readFileSync(REPORT_QUEUE_FILE, "utf-8"));
      }
    } catch {}
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
    console.log(`📝 任务汇报已记录(wf): [${status}] ${task.title}`);
  } catch (e) {
    console.error("汇报MAIN失败:", e);
  }
}

function triggerAgent(agentId: string, task: Task, stepName: string): void {
  if (!agentId) return;
  try {
    const message = `🦞 龙虾军团任务：${task.title}\n步骤：${stepName}\n\n请执行并输出结果。`;
    const cmd = `openclaw agent --agent "${agentId}" --message "${message.replace(/"/g, '\\"')}" --timeout 60`;
    // 异步触发，不等待结果
    execSync(cmd, { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
  } catch (e) {
    console.log(`Agent ${agentId} 触发完成（可能有错误）`);
  }
}

/**
 * 自动推进任务到下一步
 */
function autoAdvanceTask(taskId: string): void {
  const tasks = readTasks();
  const taskIdx = tasks.findIndex((t: Task) => t.id === taskId);
  if (taskIdx === -1) return;
  
  const task = tasks[taskIdx];
  const steps = task.workflowSteps || [];
  const currentIdx = task.currentStep ?? 0;
  
  // 标记当前步骤完成
  if (task.executionLog) {
    const currentStep = steps[currentIdx];
    task.executionLog.push({
      stepId: currentStep?.id || `step-${currentIdx + 1}`,
      stepName: currentStep?.name || `步骤${currentIdx + 1}`,
      stepType: currentStep?.type || "execute",
      executedBy: currentStep?.assigneeId,
      executedAt: new Date().toISOString(),
      result: "success",
      notes: "✅ 步骤完成，自动进入下一步"
    });
  }
  
  // 进入下一步
  const nextIdx = currentIdx + 1;
  if (nextIdx >= steps.length) {
    // 所有步骤完成
    task.status = "done";
    task.updatedAt = new Date().toISOString();
    tasks[taskIdx] = task;
    writeTasks(tasks);
    console.log(`✅ 任务${taskId}全部完成`);
    return;
  }
  
  // 推进到下一步
  const nextStep = steps[nextIdx];
  task.currentStep = nextIdx;
  task.status = "in_progress"; // 直接in_progress，不需要review等待
  
  // 添加下一步执行日志
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
  
  // 触发下一个Agent
  if (nextStep?.assigneeId) {
    addToAgentInbox(nextStep.assigneeId, task, nextStep.name || "");
    triggerAgent(nextStep.assigneeId, task, nextStep.name || "");
  }
  
  console.log(`✅ 任务${taskId}自动推进到步骤${nextIdx + 1}`);
}

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

    // 处理审核通过/不通过
    if (action === "pass" || action === "fail") {
      const currentIdx = task.currentStep ?? 0;
      const currentStep = steps[currentIdx];
      
      // 记录当前步骤结果
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
      
      // 决定下一步索引
      let nextIdx: number;
      if (action === "pass") {
        nextIdx = currentIdx + 1;
      } else {
        // 不通过，跳转到failNext或重新执行当前步骤
        nextIdx = currentStep?.failNext ?? currentIdx;
      }
      
      // 检查是否完成
      if (nextIdx >= steps.length) {
        task.status = "done";
        task.updatedAt = new Date().toISOString();
        tasks[taskIdx] = task;
        writeTasks(tasks);
        // 🔥 汇报给 MAIN
        reportToMain(task, legion, "done", `✅ 任务「${task.title}」已完成`);
        return NextResponse.json({
          success: true,
          message: "✅ 任务全部完成",
          task: tasks[taskIdx]
        });
      }
      
      // 推进到下一步
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
      
      // 触发下一个Agent
      if (nextStep?.assigneeId) {
        addToAgentInbox(nextStep.assigneeId, task, nextStep.name || "");
        triggerAgent(nextStep.assigneeId, task, nextStep.name || "");
      }
      
      return NextResponse.json({
        success: true,
        message: action === "pass" ? "✅ 审核通过，已进入下一步" : "❌ 已重新执行",
        task: tasks[taskIdx],
        workflowInfo: {
          totalSteps: steps.length,
          currentStep: nextIdx + 1,
          currentAgent: nextStep?.assigneeId
        }
      });
    }

    // 执行指定步骤
    const targetStepIndex = stepIndex !== undefined ? stepIndex : (task.currentStep ?? 0);
    const step = steps[targetStepIndex];
    
    if (!step) {
      return NextResponse.json({ error: `步骤${targetStepIndex + 1}不存在` }, { status: 400 });
    }

    const agentId = step.assigneeId || "";

    // 标记之前的步骤完成
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
    task.status = "in_progress"; // 直接in_progress，不卡在review
    task.updatedAt = new Date().toISOString();
    tasks[taskIdx] = task;
    writeTasks(tasks);

    // 触发Agent
    if (agentId) {
      addToAgentInbox(agentId, task, step.name);
      triggerAgent(agentId, task, step.name);
    }

    // ⭐ 核心：执行后同步自动推进到下一步
    const nextIdx = targetStepIndex + 1;
    
    // 标记当前步骤完成
    if (task.executionLog) {
      task.executionLog.push({
        stepId: step.id || `step-${targetStepIndex + 1}`,
        stepName: step.name,
        stepType: step.type,
        executedBy: agentId,
        executedAt: new Date().toISOString(),
        result: "success",
        notes: nextIdx >= steps.length ? "✅ 任务全部完成" : "✅ 步骤完成，自动进入下一步"
      });
    }
    
    if (nextIdx < steps.length) {
      // 立即进入下一步
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
      
      // 触发下一个Agent
      if (nextStep?.assigneeId) {
        addToAgentInbox(nextStep.assigneeId, task, nextStep.name || "");
        triggerAgent(nextStep.assigneeId, task, nextStep.name || "");
      }
      
      return NextResponse.json({
        success: true,
        message: `步骤"${step.name}"执行中，已自动推进到下一步"${nextStep?.name}"`,
        task: tasks[taskIdx],
        workflowInfo: {
          totalSteps: steps.length,
          currentStep: nextIdx + 1,
          currentAgent: nextStep?.assigneeId,
          stepName: nextStep?.name
        }
      });
    } else {
      // 最后一步 → 直接完成
      task.currentStep = targetStepIndex;
      task.status = "done";
      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      writeTasks(tasks);
      // 🔥 汇报给 MAIN
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
