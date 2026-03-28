import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const EXECUTOR_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-agent-executor-queue.json");

interface ExecutorTask {
  id: string;
  taskId: string;
  taskTitle: string;
  legionId: string;
  legionName: string;
  agentId: string;
  action: "start" | "execute" | "review" | "approve" | "reject" | "complete" | "archive";
  stepIndex?: number;
  stepName?: string;
  priority: "P0" | "P1" | "P2";
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount?: number;
}

interface ExecutorQueue {
  tasks: ExecutorTask[];
  lastProcessedAt?: string;
  totalProcessed: number;
  totalFailed: number;
}

function readQueue(): ExecutorQueue {
  try {
    if (!fs.existsSync(EXECUTOR_QUEUE_FILE)) {
      return { tasks: [], totalProcessed: 0, totalFailed: 0 };
    }
    return JSON.parse(fs.readFileSync(EXECUTOR_QUEUE_FILE, "utf-8"));
  } catch {
    return { tasks: [], totalProcessed: 0, totalFailed: 0 };
  }
}

function writeQueue(queue: ExecutorQueue): boolean {
  try {
    const dir = path.dirname(EXECUTOR_QUEUE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(EXECUTOR_QUEUE_FILE, JSON.stringify(queue, null, 2));
    return true;
  } catch (e) {
    console.error("写入执行队列失败:", e);
    return false;
  }
}

/**
 * POST - 添加任务到执行队列
 * Request body:
 * {
 *   taskId: string,
 *   taskTitle: string,
 *   legionId: string,
 *   legionName: string,
 *   agentId: string,
 *   action: "start" | "execute" | "review" | "approve" | "reject" | "complete" | "archive",
 *   stepIndex?: number,
 *   stepName?: string,
 *   priority?: "P0" | "P1" | "P2"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      taskId,
      taskTitle,
      legionId,
      legionName,
      agentId,
      action,
      stepIndex,
      stepName,
      priority = "P1"
    } = body;

    // 验证必填字段
    if (!taskId || !agentId || !action) {
      return NextResponse.json(
        { error: "缺少必填字段：taskId, agentId, action" },
        { status: 400 }
      );
    }

    const validActions = ["start", "execute", "review", "approve", "reject", "complete", "archive"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `无效的 action，必须是：${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const queue = readQueue();

    // 创建新任务
    const newTask: ExecutorTask = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      taskTitle: taskTitle || taskId,
      legionId: legionId || "",
      legionName: legionName || "",
      agentId,
      action,
      stepIndex,
      stepName,
      priority,
      status: "pending",
      createdAt: new Date().toISOString(),
      retryCount: 0
    };

    // 添加到队列
    queue.tasks.push(newTask);

    // 按优先级排序（P0 > P1 > P2）
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    queue.tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    if (!writeQueue(queue)) {
      return NextResponse.json(
        { error: "保存执行队列失败" },
        { status: 500 }
      );
    }

    console.log(`📥 任务已添加到执行队列：[${newTask.id}] ${action} - ${taskTitle}`);

    return NextResponse.json({
      success: true,
      message: "任务已添加到执行队列",
      task: newTask,
      queueLength: queue.tasks.length
    });

  } catch (e: any) {
    console.error("添加任务到执行队列失败:", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}

/**
 * GET - 获取执行队列状态
 * Query params:
 * - status?: "pending" | "processing" | "completed" | "failed"
 * - agentId?: string
 * - taskId?: string
 * - limit?: number (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agentId");
    const taskId = searchParams.get("taskId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const queue = readQueue();

    // 过滤任务
    let filteredTasks = queue.tasks;

    if (status) {
      filteredTasks = filteredTasks.filter(t => t.status === status);
    }

    if (agentId) {
      filteredTasks = filteredTasks.filter(t => t.agentId === agentId);
    }

    if (taskId) {
      filteredTasks = filteredTasks.filter(t => t.taskId === taskId);
    }

    // 限制返回数量
    filteredTasks = filteredTasks.slice(0, limit);

    // 统计信息
    const stats = {
      total: queue.tasks.length,
      pending: queue.tasks.filter(t => t.status === "pending").length,
      processing: queue.tasks.filter(t => t.status === "processing").length,
      completed: queue.tasks.filter(t => t.status === "completed").length,
      failed: queue.tasks.filter(t => t.status === "failed").length,
      totalProcessed: queue.totalProcessed,
      totalFailed: queue.totalFailed
    };

    return NextResponse.json({
      queue: filteredTasks,
      stats,
      lastProcessedAt: queue.lastProcessedAt
    });

  } catch (e: any) {
    console.error("获取执行队列状态失败:", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 清除完成的执行记录
 * Query params:
 * - olderThan?: number (hours, default: 24)
 * - status?: "completed" | "failed" (default: "completed")
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThan = parseInt(searchParams.get("olderThan") || "24", 10);
    const status = searchParams.get("status") || "completed";

    const queue = readQueue();
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - olderThan * 60 * 60 * 1000);

    const originalCount = queue.tasks.length;

    // 过滤掉完成的记录
    queue.tasks = queue.tasks.filter(task => {
      if (status === "completed" && task.status !== "completed") {
        return true;
      }
      if (status === "failed" && task.status !== "failed") {
        return true;
      }
      if (status === "all" && (task.status === "pending" || task.status === "processing")) {
        return true;
      }

      // 检查是否超过保留时间
      const completedAt = task.completedAt ? new Date(task.completedAt) : new Date(task.createdAt);
      return completedAt > cutoffTime;
    });

    const removedCount = originalCount - queue.tasks.length;

    if (!writeQueue(queue)) {
      return NextResponse.json(
        { error: "保存执行队列失败" },
        { status: 500 }
      );
    }

    console.log(`🧹 已清除 ${removedCount} 条${status}的执行记录`);

    return NextResponse.json({
      success: true,
      message: `已清除 ${removedCount} 条执行记录`,
      removedCount,
      remainingCount: queue.tasks.length
    });

  } catch (e: any) {
    console.error("清除执行记录失败:", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH - 更新任务状态（内部使用）
 * 用于标记任务为 processing/completed/failed
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, status, result, error } = body;

    if (!taskId || !status) {
      return NextResponse.json(
        { error: "缺少必填字段：taskId, status" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "processing", "completed", "failed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `无效的 status，必须是：${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const queue = readQueue();
    const taskIndex = queue.tasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) {
      return NextResponse.json(
        { error: "任务不存在" },
        { status: 404 }
      );
    }

    const task = queue.tasks[taskIndex];
    task.status = status;

    if (status === "processing") {
      task.startedAt = new Date().toISOString();
    }

    if (status === "completed" || status === "failed") {
      task.completedAt = new Date().toISOString();
      if (result) task.result = result;
      if (error) task.error = error;

      if (status === "completed") {
        queue.totalProcessed++;
      } else if (status === "failed") {
        queue.totalFailed++;
      }

      queue.lastProcessedAt = new Date().toISOString();
    }

    queue.tasks[taskIndex] = task;

    if (!writeQueue(queue)) {
      return NextResponse.json(
        { error: "保存执行队列失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `任务状态已更新为 ${status}`,
      task
    });

  } catch (e: any) {
    console.error("更新任务状态失败:", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}
