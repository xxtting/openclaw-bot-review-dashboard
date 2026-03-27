/**
 * Agent状态监控API - 龙虾军团监控Agent状态
 * 
 * 功能:
 * 1. 获取所有Agent的在线状态
 * 2. 获取Agent的执行日志
 * 3. 获取Agent的任务统计
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const AGENTS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json"); // Agent信息在legions文件中

interface Task {
  id: string;
  legionId: string;
  title: string;
  status: string;
  assigneeId?: string;
  agentExecution?: {
    agentId: string;
    startedAt?: string;
    completedAt?: string;
    result?: 'success' | 'failed' | 'pending';
  };
  executionLog?: Array<{
    stepId: string;
    stepName: string;
    executedBy?: string;
    executedAt: string;
    result: string;
    notes?: string;
  }>;
}

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
  legionId: string;
  lastActive?: string;
}

interface AgentStats {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  legionId: string;
  legionName: string;
  status: 'online' | 'offline' | 'busy';
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  lastActivity?: string;
}

/**
 * GET /api/agent/status
 * 获取所有Agent的状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const legionId = searchParams.get('legionId');

    const tasks = readTasks();
    const legionsData = readLegions();
    const inbox = readInbox();

    // 构建Agent统计
    const agentStats: Map<string, AgentStats> = new Map();

    // 初始化所有Agent的统计
    for (const agent of legionsData.agents || []) {
      if (legionId && agent.legionId !== legionId) continue;

      const agentTasks = tasks.filter((t: Task) => t.assigneeId === agent.id);
      const completedTasks = agentTasks.filter((t: Task) => 
        t.agentExecution?.agentId === agent.id && t.agentExecution?.result === 'success'
      ).length;
      const failedTasks = agentTasks.filter((t: Task) => 
        t.agentExecution?.agentId === agent.id && t.agentExecution?.result === 'failed'
      ).length;
      const pendingInbox = inbox.agents[agent.id]?.pendingTasks?.length || 0;

      const legion = legionsData.legions?.find((l: any) => l.id === agent.legionId);

      let status: 'online' | 'offline' | 'busy' = 'offline';
      
      // 根据收件箱和执行状态判断
      if (pendingInbox > 0) {
        status = agentTasks.some((t: Task) => t.status === 'in_progress') ? 'busy' : 'online';
      }

      // 检查最后活跃时间
      let lastActivity: string | undefined;
      const executingTasks = agentTasks.filter((t: Task) => 
        t.agentExecution?.agentId === agent.id && t.agentExecution?.startedAt
      );
      if (executingTasks.length > 0) {
        const latestTask = executingTasks.reduce((latest: Task, t: Task) => {
          const latestTime = latest.agentExecution?.startedAt || '';
          const currentTime = t.agentExecution?.startedAt || '';
          return currentTime > latestTime ? t : latest;
        });
        lastActivity = latestTask.agentExecution?.startedAt;
      }

      agentStats.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        legionId: agent.legionId,
        legionName: legion?.name || '未知军团',
        status,
        pendingTasks: pendingInbox,
        completedTasks,
        failedTasks,
        totalTasks: agentTasks.length,
        lastActivity,
      });
    }

    const statsArray = Array.from(agentStats.values());

    // 按状态和名称排序
    statsArray.sort((a, b) => {
      const statusOrder = { busy: 0, online: 1, offline: 2 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.agentName.localeCompare(b.agentName);
    });

    return NextResponse.json({
      success: true,
      agents: statsArray,
      summary: {
        total: statsArray.length,
        online: statsArray.filter((a) => a.status === 'online').length,
        busy: statsArray.filter((a) => a.status === 'busy').length,
        offline: statsArray.filter((a) => a.status === 'offline').length,
        totalPendingTasks: statsArray.reduce((sum, a) => sum + a.pendingTasks, 0),
        totalCompletedTasks: statsArray.reduce((sum, a) => sum + a.completedTasks, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/agent/status/logs
 * 获取Agent的执行日志
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, startDate, endDate, limit = 50 } = body;

    const tasks = readTasks();
    const legionsData = readLegions();

    // 筛选该Agent的任务日志
    let logs: any[] = [];

    for (const task of tasks) {
      if (agentId && task.assigneeId !== agentId) continue;
      if (!task.executionLog || task.executionLog.length === 0) continue;

      for (const log of task.executionLog) {
        if (agentId && log.executedBy !== agentId) continue;

        const logDate = new Date(log.executedAt);
        if (startDate && logDate < new Date(startDate)) continue;
        if (endDate && logDate > new Date(endDate)) continue;

        const agent = legionsData.agents?.find((a: any) => a.id === log.executedBy);
        const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);

        logs.push({
          ...log,
          taskId: task.id,
          taskTitle: task.title,
          taskStatus: task.status,
          agentName: agent?.name || log.executedBy || 'Unknown',
          agentEmoji: agent?.emoji || '🤖',
          legionName: legion?.name || '未知军团',
        });
      }
    }

    // 按时间降序排序
    logs.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

    // 限制数量
    logs = logs.slice(0, limit);

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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

/**
 * 读取收件箱
 */
function readInbox(): any {
  try {
    if (!fs.existsSync(INBOX_FILE)) {
      return { agents: {} };
    }
    return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
  } catch {
    return { agents: {} };
  }
}
