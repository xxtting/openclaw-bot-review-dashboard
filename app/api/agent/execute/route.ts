/**
 * Agent任务执行API - Agent执行龙虾军团任务
 * 
 * 功能:
 * 1. Agent获取待执行任务
 * 2. Agent开始执行任务
 * 3. Agent完成任务或报告问题
 * 4. 与龙虾军团任务系统同步状态
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const EXECUTION_LOG = path.join(OPENCLAW_HOME, "lobster-agent-execution", "execution-log.json");

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
  agentExecution?: {
    agentId: string;
    startedAt: string;
    completedAt?: string;
    result?: 'success' | 'failed' | 'pending';
    notes?: string;
  };
}

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
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

interface InboxTask {
  id: string;
  taskId: string;
  title: string;
  legionId: string;
  legionName: string;
  priority: string;
  status: string;
  createdAt: string;
  message: string;
}

interface AgentInbox {
  inboxVersion: string;
  lastUpdated: string;
  agents: Record<string, {
    pendingTasks: InboxTask[];
    lastCheck: string;
  }>;
}

/**
 * GET /api/agent/execute
 * Agent获取可执行的任务详情
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const inboxTaskId = searchParams.get('inboxTaskId');

    if (!agentId) {
      return NextResponse.json({ error: '缺少agentId参数' }, { status: 400 });
    }

    // 从收件箱获取任务
    const inbox = readInbox();
    const agentInbox = inbox.agents[agentId];

    if (!agentInbox) {
      return NextResponse.json({ error: 'Agent收件箱为空' }, { status: 404 });
    }

    let task: InboxTask | undefined;
    
    if (inboxTaskId) {
      task = agentInbox.pendingTasks.find((t: InboxTask) => t.id === inboxTaskId);
    } else {
      // 返回第一个待处理任务
      task = agentInbox.pendingTasks[0];
    }

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 获取完整的龙虾军团任务详情
    const lobsterTask = getLobsterTask(task.taskId);

    return NextResponse.json({
      success: true,
      inboxTask: task,
      lobsterTask,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/agent/execute
 * Agent执行任务
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, inboxTaskId, taskId, action, notes } = body;

    if (!agentId) {
      return NextResponse.json({ error: '缺少agentId参数' }, { status: 400 });
    }

    if (!taskId && !inboxTaskId) {
      return NextResponse.json({ error: '缺少taskId或inboxTaskId参数' }, { status: 400 });
    }

    // 确定要执行的任务ID
    let targetTaskId = taskId;
    let targetInboxTaskId = inboxTaskId;

    if (!targetTaskId && targetInboxTaskId) {
      // 从收件箱任务获取lobster任务ID
      const inbox = readInbox();
      const agentInbox = inbox.agents[agentId];
      if (agentInbox) {
        const inboxTask = agentInbox.pendingTasks.find((t: InboxTask) => t.id === targetInboxTaskId);
        if (inboxTask) {
          targetTaskId = inboxTask.taskId;
        }
      }
    }

    // 读取龙虾军团任务
    const tasks = readTasks();
    const taskIndex = tasks.findIndex((t: Task) => t.id === targetTaskId);

    if (taskIndex === -1) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    const task = tasks[taskIndex];

    // 处理不同操作
    if (action === 'start') {
      // Agent开始执行任务
      return handleStartExecution(tasks, taskIndex, task, agentId, notes);
    } else if (action === 'progress') {
      // Agent报告进度
      return handleProgressUpdate(tasks, taskIndex, task, agentId, notes);
    } else if (action === 'complete') {
      // Agent完成任务
      return handleCompletion(tasks, taskIndex, task, agentId, notes);
    } else if (action === 'fail') {
      // Agent报告失败
      return handleFailure(tasks, taskIndex, task, agentId, notes);
    } else if (action === 'confirm') {
      // Agent确认收到任务 (从收件箱移除但不执行)
      return handleConfirm(tasks, taskIndex, task, agentId, targetInboxTaskId);
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * 处理任务开始执行
 */
function handleStartExecution(tasks: Task[], taskIndex: number, task: Task, agentId: string, notes?: string) {
  // 更新任务状态
  task.status = 'in_progress';
  task.executedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  
  if (!task.agentExecution) {
    task.agentExecution = {
      agentId: agentId,
      startedAt: new Date().toISOString(),
      result: 'pending'
    };
  } else {
    task.agentExecution.agentId = agentId;
    task.agentExecution.startedAt = new Date().toISOString();
    task.agentExecution.result = 'pending';
  }

  // 记录执行日志
  const log: ExecutionLog = {
    stepId: 'agent-execution',
    stepName: 'Agent执行',
    stepType: 'execute',
    executedBy: agentId,
    executedAt: new Date().toISOString(),
    result: 'pending',
    notes: notes || `Agent ${agentId} 开始执行任务`,
  };

  if (!task.executionLog) {
    task.executionLog = [];
  }
  task.executionLog.push(log);

  tasks[taskIndex] = task;
  writeTasks(tasks);

  return NextResponse.json({
    success: true,
    message: '任务已开始执行',
    task,
    log,
  });
}

/**
 * 处理进度更新
 */
function handleProgressUpdate(tasks: Task[], taskIndex: number, task: Task, agentId: string, notes?: string) {
  task.updatedAt = new Date().toISOString();

  // 记录进度日志
  const log: ExecutionLog = {
    stepId: 'agent-progress',
    stepName: '进度更新',
    stepType: 'execute',
    executedBy: agentId,
    executedAt: new Date().toISOString(),
    result: 'pending',
    notes: notes || `Agent ${agentId} 报告进度`,
  };

  if (!task.executionLog) {
    task.executionLog = [];
  }
  task.executionLog.push(log);

  tasks[taskIndex] = task;
  writeTasks(tasks);

  return NextResponse.json({
    success: true,
    message: '进度已更新',
    task,
    log,
  });
}

/**
 * 处理任务完成
 */
function handleCompletion(tasks: Task[], taskIndex: number, task: Task, agentId: string, notes?: string) {
  // 更新任务状态
  task.status = 'done';
  task.updatedAt = new Date().toISOString();
  
  if (task.agentExecution) {
    task.agentExecution.completedAt = new Date().toISOString();
    task.agentExecution.result = 'success';
    task.agentExecution.notes = notes;
  }

  // 记录完成日志
  const log: ExecutionLog = {
    stepId: 'agent-complete',
    stepName: '任务完成',
    stepType: 'execute',
    executedBy: agentId,
    executedAt: new Date().toISOString(),
    result: 'success',
    notes: notes || `Agent ${agentId} 完成任务`,
  };

  if (!task.executionLog) {
    task.executionLog = [];
  }
  task.executionLog.push(log);

  tasks[taskIndex] = task;
  writeTasks(tasks);

  return NextResponse.json({
    success: true,
    message: '任务已完成',
    task,
    log,
  });
}

/**
 * 处理任务失败
 */
function handleFailure(tasks: Task[], taskIndex: number, task: Task, agentId: string, notes?: string) {
  // 更新任务状态
  task.status = 'pending'; // 失败回到待处理
  task.updatedAt = new Date().toISOString();
  
  if (task.agentExecution) {
    task.agentExecution.completedAt = new Date().toISOString();
    task.agentExecution.result = 'failed';
    task.agentExecution.notes = notes;
  }

  // 记录失败日志
  const log: ExecutionLog = {
    stepId: 'agent-failed',
    stepName: '任务失败',
    stepType: 'execute',
    executedBy: agentId,
    executedAt: new Date().toISOString(),
    result: 'failed',
    notes: notes || `Agent ${agentId} 报告任务失败`,
  };

  if (!task.executionLog) {
    task.executionLog = [];
  }
  task.executionLog.push(log);

  tasks[taskIndex] = task;
  writeTasks(tasks);

  return NextResponse.json({
    success: true,
    message: '已记录任务失败',
    task,
    log,
  });
}

/**
 * 处理任务确认 (从收件箱移除)
 */
function handleConfirm(tasks: Task[], taskIndex: number, task: Task, agentId: string, inboxTaskId?: string) {
  // 从收件箱移除任务
  if (inboxTaskId) {
    removeFromInbox(agentId, inboxTaskId);
  }

  return NextResponse.json({
    success: true,
    message: '任务已确认',
  });
}

/**
 * 从收件箱移除任务
 */
function removeFromInbox(agentId: string, inboxTaskId: string) {
  try {
    if (!fs.existsSync(INBOX_FILE)) return;

    const inbox: AgentInbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
    
    if (inbox.agents[agentId]) {
      inbox.agents[agentId].pendingTasks = inbox.agents[agentId].pendingTasks.filter(
        (t: InboxTask) => t.id !== inboxTaskId
      );
      inbox.lastUpdated = new Date().toISOString();
      
      const dir = path.dirname(INBOX_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    }
  } catch {
    // Ignore
  }
}

/**
 * 获取龙虾军团任务
 */
function getLobsterTask(taskId: string): Task | null {
  const tasks = readTasks();
  return tasks.find((t: Task) => t.id === taskId) || null;
}

/**
 * 读取任务列表
 */
function readTasks(): Task[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * 写入任务列表
 */
function writeTasks(tasks: Task[]): boolean {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取收件箱
 */
function readInbox(): AgentInbox {
  try {
    if (!fs.existsSync(INBOX_FILE)) {
      return {
        inboxVersion: '1.0',
        lastUpdated: new Date().toISOString(),
        agents: {},
      };
    }
    return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
  } catch {
    return {
      inboxVersion: '1.0',
      lastUpdated: new Date().toISOString(),
      agents: {},
    };
  }
}
