/**
 * Agent收件箱SSE端点 - 实时任务推送
 * 
 * 功能:
 * 1. 建立SSE连接
 * 2. 实时推送新任务
 * 3. 心跳保持连接
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';

const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");

interface TaskItem {
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
    pendingTasks: TaskItem[];
    lastCheck: string;
  }>;
}

// 活跃的SSE连接
const activeConnections = new Map<string, ReadableStreamDefaultController>();

// 最后推送的任务ID (用于去重)
const lastPushedTaskIds = new Map<string, string>();

/**
 * GET /api/agent/inbox/sse
 * 建立SSE连接，实时推送任务
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return new Response('缺少agentId参数', { status: 400 });
  }

  // 创建SSE流
  const stream = new ReadableStream({
    start(controller) {
      // 注册连接
      activeConnections.set(agentId, controller);

      console.log(`[AgentInbox SSE] Agent ${agentId} connected`);

      // 发送连接成功消息
      sendMessage(controller, {
        type: 'connected',
        agentId,
        timestamp: new Date().toISOString(),
      });

      // 发送当前待办任务
      const tasks = getAgentTasks(agentId);
      sendMessage(controller, {
        type: 'tasks',
        tasks,
        count: tasks.length,
      });

      // 记录初始任务ID
      if (tasks.length > 0) {
        lastPushedTaskIds.set(agentId, tasks.map((t: TaskItem) => t.taskId).join(','));
      }

      // 启动轮询检查新任务
      const pollInterval = setInterval(() => {
        checkAndPushNewTasks(agentId, controller);
      }, 3000); // 每3秒检查一次

      // 心跳保持连接
      const heartbeatInterval = setInterval(() => {
        sendMessage(controller, {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        });
      }, 30000); // 每30秒心跳

      // 客户端断开时清理
      request.signal.addEventListener('abort', () => {
        console.log(`[AgentInbox SSE] Agent ${agentId} disconnected`);
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        activeConnections.delete(agentId);
        lastPushedTaskIds.delete(agentId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * 发送SSE消息
 */
function sendMessage(controller: ReadableStreamDefaultController, data: any) {
  try {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(new TextEncoder().encode(message));
  } catch (e) {
    console.error('[AgentInbox SSE] Send error:', e);
  }
}

/**
 * 获取Agent的待办任务
 */
function getAgentTasks(agentId: string): TaskItem[] {
  try {
    if (!fs.existsSync(INBOX_FILE)) {
      return [];
    }
    const inbox: AgentInbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
    return inbox.agents[agentId]?.pendingTasks || [];
  } catch {
    return [];
  }
}

/**
 * 检查并推送新任务
 */
function checkAndPushNewTasks(agentId: string, controller: ReadableStreamDefaultController) {
  try {
    const currentTasks = getAgentTasks(agentId);
    const currentTaskIds = currentTasks.map((t: TaskItem) => t.taskId).join(',');
    const lastTaskIds = lastPushedTaskIds.get(agentId) || '';

    // 检查是否有新任务
    if (currentTaskIds !== lastTaskIds) {
      const currentIds = new Set(currentTasks.map((t: TaskItem) => t.taskId));
      const lastIds = new Set(lastTaskIds.split(',').filter(Boolean));

      // 找出新任务
      for (const task of currentTasks) {
        if (!lastIds.has(task.taskId)) {
          console.log(`[AgentInbox SSE] Pushing new task to ${agentId}:`, task.title);
          sendMessage(controller, {
            type: 'new_task',
            task,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 更新记录
      lastPushedTaskIds.set(agentId, currentTaskIds);
    }

    // 更新inbox的最后检查时间
    updateLastCheck(agentId);
  } catch (e) {
    console.error('[AgentInbox SSE] Check error:', e);
  }
}

/**
 * 更新Agent的最后检查时间
 */
function updateLastCheck(agentId: string) {
  try {
    if (!fs.existsSync(INBOX_FILE)) return;
    
    const inbox: AgentInbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
    
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = {
        pendingTasks: [],
        lastCheck: new Date().toISOString(),
      };
    }
    
    inbox.agents[agentId].lastCheck = new Date().toISOString();
    inbox.lastUpdated = new Date().toISOString();
    
    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
  } catch {
    // Ignore
  }
}

/**
 * 向指定Agent推送任务 (被动调用)
 * 这个函数可以被其他API调用，用于实时推送任务
 */
export function pushTaskToAgent(agentId: string, task: TaskItem) {
  const controller = activeConnections.get(agentId);
  
  if (controller) {
    console.log(`[AgentInbox SSE] Direct push to ${agentId}:`, task.title);
    sendMessage(controller, {
      type: 'new_task',
      task,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  
  return false;
}

/**
 * 向所有连接的Agent广播任务
 */
export function broadcastTaskToAll(task: TaskItem) {
  console.log('[AgentInbox SSE] Broadcasting to all agents:', task.title);
  
  for (const [agentId, controller] of activeConnections) {
    sendMessage(controller, {
      type: 'new_task',
      task,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 获取当前连接数 (用于监控)
 */
export function getConnectionCount(): number {
  return activeConnections.size;
}

/**
 * 获取所有连接的Agent列表 (用于监控)
 */
export function getConnectedAgents(): string[] {
  return Array.from(activeConnections.keys());
}
