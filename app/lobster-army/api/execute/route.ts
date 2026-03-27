import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");

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
  fromBoss?: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
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

// 执行工作流步骤的核心逻辑
async function executeStep(task: Task, stepIndex: number): Promise<{ success: boolean; message: string; result?: any }> {
  const steps = task.workflowSteps || [];
  const step = steps[stepIndex];

  if (!step) {
    return { success: false, message: `步骤 ${stepIndex + 1} 不存在` };
  }

  const STEP_HANDLERS: Record<string, (task: Task, step: WorkflowStep) => Promise<{ success: boolean; message: string; result?: any }>> = {
    execute: async (t, s) => {
      // 执行任务 - 更新任务状态为进行中
      return {
        success: true,
        message: `⚡ 执行中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    review: async (t, s) => {
      // 审核任务 - 更新状态为待审核
      return {
        success: true,
        message: `👀 待审核: ${t.title}`,
        result: { newStatus: "review" }
      };
    },
    test: async (t, s) => {
      // 测试任务 - 更新状态为进行中
      return {
        success: true,
        message: `🧪 测试中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    deploy: async (t, s) => {
      // 部署任务
      return {
        success: true,
        message: `🚀 部署中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    archive: async (t, s) => {
      // 存档任务 - 完成任务
      return {
        success: true,
        message: `📦 已存档: ${t.title}`,
        result: { newStatus: "archived" }
      };
    }
  };

  const handler = STEP_HANDLERS[step.type];
  if (!handler) {
    return { success: false, message: `未知的步骤类型: ${step.type}` };
  }

  return handler(task, step);
}

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

    // 读取军团信息获取工作流定义
    const legionsData = readLegions();
    const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);
    const workflowSteps = legion?.workflowSteps || [
      { id: "step-1", name: "执行", type: "execute" },
      { id: "step-2", name: "审核", type: "review" },
      { id: "step-3", name: "存档", type: "archive" },
    ];

    // 为任务设置工作流步骤
    if (!task.workflowSteps) {
      task.workflowSteps = workflowSteps;
    }

    // 如果没有当前步骤，初始化为0
    if (task.currentStep === undefined) {
      task.currentStep = 0;
    }

    if (action === "next" || action === "execute") {
      // 执行下一步或当前步骤
      const targetStep = stepIndex !== undefined ? stepIndex : task.currentStep;
      const result = await executeStep(task, targetStep);

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      // 记录执行日志
      const steps = task.workflowSteps || [];
      const log: ExecutionLog = {
        stepId: steps[targetStep]?.id || `step-${targetStep + 1}`,
        stepName: steps[targetStep]?.name || `步骤${targetStep + 1}`,
        stepType: steps[targetStep]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: result.message
      };

      // 更新任务状态
      task.status = result.result?.newStatus || task.status;
      task.currentStep = targetStep + 1;
      task.updatedAt = new Date().toISOString();
      task.executedAt = new Date().toISOString();
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      // 如果所有步骤完成，自动标记为done
      if ((task.currentStep ?? 0) >= (task.workflowSteps?.length || 0)) {
        task.status = "done";
      }

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        task: tasks[taskIdx],
        log
      });

    } else if (action === "start") {
      // 开始任务 - 从第一步开始执行
      task.status = "in_progress";
      task.currentStep = 0;
      task.updatedAt = new Date().toISOString();
      (task as any).startedAt = new Date().toISOString();

      const steps = task.workflowSteps || [];
      const log: ExecutionLog = {
        stepId: steps[0]?.id || "step-1",
        stepName: steps[0]?.name || "开始",
        stepType: steps[0]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: `🚀 任务开始: ${task.title}`
      };
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "任务已开始",
        task: tasks[taskIdx]
      });

    } else if (action === "complete") {
      // 完成任务
      task.status = "done";
      task.currentStep = task.workflowSteps?.length || 0;
      task.updatedAt = new Date().toISOString();
      (task as any).completedAt = new Date().toISOString();

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "任务已完成",
        task: tasks[taskIdx]
      });

    } else if (action === "fail") {
      // 标记步骤失败
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

      return NextResponse.json({
        success: true,
        message: "步骤执行失败",
        task: tasks[taskIdx],
        log
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

    // 返回所有执行日志
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
