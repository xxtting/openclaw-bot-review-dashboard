/**
 * 任务下发API - 龙虾军团 → Agent
 * 
 * 功能:
 * 1. 从龙虾军团任务系统获取任务
 * 2. 向Agent收件箱下发任务
 * 3. 支持批量下发
 * 4. 任务状态同步
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';
import { pushTaskToAgent, broadcastTaskToAll } from '../inbox/sse/route';

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");

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
  dispatchedToInbox?: boolean; // 标记是否已下发到Agent收件箱
}

interface Legion {
  id: string;
  name: string;
  emoji: string;
  leaderId: string;
  memberIds: string[];
  status: string;
  workflowSteps: WorkflowStep[];
  color: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
  legionId: string;
  parentId: string | null;
  childIds: string[];
}

/**
 * GET /api/agent/dispatch
 * 获取可下发的任务列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const legionId = searchParams.get('legionId');
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');

    const tasks = readTasks();
    const legionsData = readLegions();

    let filteredTasks = tasks;

    // 按军团筛选
    if (legionId) {
      filteredTasks = filteredTasks.filter((t: Task) => t.legionId === legionId);
    }

    // 按Agent筛选 (任务的assigneeId匹配)
    if (agentId) {
      filteredTasks = filteredTasks.filter((t: Task) => t.assigneeId === agentId);
    }

    // 按状态筛选
    if (status) {
      filteredTasks = filteredTasks.filter((t: Task) => t.status === status);
    }

    // 只返回未下发的任务
    filteredTasks = filteredTasks.filter((t: Task) => !t.dispatchedToInbox);

    // 添加军团名称
    const tasksWithLegion = filteredTasks.map((t: Task) => {
      const legion = legionsData.legions?.find((l: Legion) => l.id === t.legionId);
      return {
        ...t,
        legionName: legion?.name || '未知军团',
      };
    });

    return NextResponse.json({
      success: true,
      tasks: tasksWithLegion,
      count: tasksWithLegion.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/agent/dispatch
 * 下发任务给Agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, agentId, priority, message } = body;

    if (!taskId) {
      return NextResponse.json({ error: '缺少taskId参数' }, { status: 400 });
    }

    // 读取任务和军团数据
    const tasks = readTasks();
    const legionsData = readLegions();
    const task = tasks.find((t: Task) => t.id === taskId);

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 获取军团信息
    const legion = legionsData.legions?.find((l: Legion) => l.id === task.legionId);

    // 确定目标Agent
    let targetAgentId = agentId || task.assigneeId;
    
    if (!targetAgentId) {
      // 如果没有指定Agent，尝试使用任务的负责人
      if (legion?.leaderId) {
        targetAgentId = legion.leaderId;
      } else if (legion?.memberIds?.length > 0) {
        targetAgentId = legion.memberIds[0];
      } else {
        return NextResponse.json({ error: '没有可用的Agent' }, { status: 400 });
      }
    }

    // 构建收件箱任务
    const inboxTask = {
      id: `inbox-${Date.now()}`,
      taskId: task.id,
      title: task.title,
      legionId: task.legionId,
      legionName: legion?.name || '未知军团',
      priority: priority || task.priority || 'P1',
      status: 'pending',
      createdAt: new Date().toISOString(),
      message: message || task.description || `请执行任务: ${task.title}`,
    };

    // 添加到Agent收件箱
    const success = addToInbox(targetAgentId, inboxTask);

    if (!success) {
      return NextResponse.json({ error: '下发失败' }, { status: 500 });
    }

    // 标记任务已下发
    task.dispatchedToInbox = true;
    task.updatedAt = new Date().toISOString();
    writeTasks(tasks);

    // 尝试实时推送 (如果Agent在线)
    const pushed = pushTaskToAgent(targetAgentId, inboxTask);

    return NextResponse.json({
      success: true,
      message: `任务已发送给Agent ${targetAgentId}`,
      agentId: targetAgentId,
      task: inboxTask,
      realtimePush: pushed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/agent/dispatch/batch
 * 批量下发任务给多个Agent
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, agentIds, legionId, priority, message } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: '缺少taskIds参数' }, { status: 400 });
    }

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: '缺少agentIds参数' }, { status: 400 });
    }

    const tasks = readTasks();
    const legionsData = readLegions();

    const results: Array<{
      taskId: string;
      agentId: string;
      success: boolean;
      message: string;
    }> = [];

    for (const taskId of taskIds) {
      const task = tasks.find((t: Task) => t.id === taskId);
      if (!task) {
        results.push({ taskId, agentId: '', success: false, message: '任务不存在' });
        continue;
      }

      const legion = legionsData.legions?.find((l: Legion) => l.id === task.legionId);
      const inboxTask = {
        id: `inbox-${Date.now()}-${taskId}`,
        taskId: task.id,
        title: task.title,
        legionId: task.legionId,
        legionName: legion?.name || '未知军团',
        priority: priority || task.priority || 'P1',
        status: 'pending',
        createdAt: new Date().toISOString(),
        message: message || task.description || `请执行任务: ${task.title}`,
      };

      for (const agentId of agentIds) {
        const success = addToInbox(agentId, inboxTask);
        
        if (success) {
          task.dispatchedToInbox = true;
          task.updatedAt = new Date().toISOString();
          pushTaskToAgent(agentId, inboxTask);
          results.push({ taskId, agentId, success: true, message: '下发成功' });
        } else {
          results.push({ taskId, agentId, success: false, message: '下发失败' });
        }
      }
    }

    writeTasks(tasks);

    return NextResponse.json({
      success: true,
      results,
      totalSuccess: results.filter((r) => r.success).length,
      totalFailed: results.filter((r) => !r.success).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * 添加任务到Agent收件箱
 */
function addToInbox(agentId: string, task: any): boolean {
  try {
    let inbox: any;

    if (fs.existsSync(INBOX_FILE)) {
      inbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
    } else {
      inbox = {
        inboxVersion: '1.0',
        lastUpdated: new Date().toISOString(),
        agents: {},
      };
    }

    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = {
        pendingTasks: [],
        lastCheck: new Date().toISOString(),
      };
    }

    // 检查是否已存在
    const exists = inbox.agents[agentId].pendingTasks.some(
      (t: any) => t.taskId === task.taskId
    );

    if (!exists) {
      inbox.agents[agentId].pendingTasks.push(task);
      inbox.lastUpdated = new Date().toISOString();

      const dir = path.dirname(INBOX_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    }

    return true;
  } catch {
    return false;
  }
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
 * 读取军团数据
 */
function readLegions(): any {
  try {
    if (!fs.existsSync(LEGIONS_FILE)) return { legions: [], agents: [] };
    return JSON.parse(fs.readFileSync(LEGIONS_FILE, 'utf-8'));
  } catch {
    return { legions: [], agents: [] };
  }
}
