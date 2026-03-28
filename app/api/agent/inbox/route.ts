import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';

const INBOX_FILE = path.join(OPENCLAW_HOME, 'lobster-agent-inbox', 'agent-inbox.json');

// 确保目录存在
function ensureDir() {
  const dir = path.dirname(INBOX_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 读取收件箱数据
function readInbox(): any {
  try {
    ensureDir();
    if (!fs.existsSync(INBOX_FILE)) {
      return { agents: {} };
    }
    return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
  } catch (e) {
    console.error('[Agent Inbox] 读取失败:', e);
    return { agents: {} };
  }
}

// 写入收件箱数据
function writeInbox(data: any): boolean {
  try {
    ensureDir();
    fs.writeFileSync(INBOX_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[Agent Inbox] 写入失败:', e);
    return false;
  }
}

/**
 * POST - 添加任务到Agent收件箱
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentId,
      taskId,
      title,
      legionId,
      legionName,
      priority,
      message,
      action // 'start', 'execute', 'feedback', 'restart'
    } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId 不能为空' },
        { status: 400 }
      );
    }

    const inbox = readInbox();

    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = {
        agentId,
        pendingTasks: [],
        lastCheck: new Date().toISOString()
      };
    }

    // 检查任务是否已存在
    const exists = inbox.agents[agentId].pendingTasks.some((t: any) => t.taskId === taskId);
    if (exists) {
      return NextResponse.json({
        success: true,
        message: '任务已存在于收件箱'
      });
    }

    // 添加任务
    const taskEntry = {
      id: `inbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      title,
      legionId,
      legionName,
      priority: priority || 'P2',
      status: 'pending',
      action: action || 'start',
      message: message || `📋 新任务：${title}`,
      createdAt: new Date().toISOString()
    };

    inbox.agents[agentId].pendingTasks.push(taskEntry);
    inbox.agents[agentId].lastCheck = new Date().toISOString();

    if (writeInbox(inbox)) {
      console.log(`[Agent Inbox] 已添加任务到 ${agentId}: ${title}`);
      return NextResponse.json({
        success: true,
        data: { task: taskEntry },
        message: '任务已添加到收件箱'
      });
    } else {
      return NextResponse.json(
        { error: '保存失败' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[Agent Inbox] 错误:', e);
    return NextResponse.json(
      { error: e.message || '操作失败' },
      { status: 500 }
    );
  }
}

/**
 * GET - 获取Agent收件箱
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    const inbox = readInbox();

    if (agentId) {
      // 获取指定Agent的收件箱
      const agentInbox = inbox.agents[agentId] || {
        agentId,
        pendingTasks: [],
        lastCheck: null
      };

      return NextResponse.json({
        success: true,
        data: agentInbox
      });
    } else {
      // 获取所有Agent的收件箱统计
      const summary = {
        totalAgents: Object.keys(inbox.agents).length,
        totalPendingTasks: 0,
        agents: []
      };

      for (const [aid, data] of Object.entries(inbox.agents)) {
        const agentData = data as any;
        summary.totalPendingTasks += agentData.pendingTasks?.length || 0;
        summary.agents.push({
          agentId: aid,
          pendingTasks: agentData.pendingTasks?.length || 0,
          lastCheck: agentData.lastCheck
        });
      }

      return NextResponse.json({
        success: true,
        data: summary
      });
    }
  } catch (e: any) {
    console.error('[Agent Inbox] 错误:', e);
    return NextResponse.json(
      { error: e.message || '获取失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 清理Agent收件箱中的任务
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const taskId = searchParams.get('taskId');

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId 不能为空' },
        { status: 400 }
      );
    }

    const inbox = readInbox();

    if (!inbox.agents[agentId]) {
      return NextResponse.json(
        { error: 'Agent不存在' },
        { status: 404 }
      );
    }

    if (taskId) {
      // 删除指定任务
      const originalLength = inbox.agents[agentId].pendingTasks.length;
      inbox.agents[agentId].pendingTasks = inbox.agents[agentId].pendingTasks.filter(
        (t: any) => t.taskId !== taskId
      );

      if (writeInbox(inbox)) {
        return NextResponse.json({
          success: true,
          message: '任务已删除',
          removed: originalLength - inbox.agents[agentId].pendingTasks.length
        });
      }
    } else {
      // 清空整个收件箱
      inbox.agents[agentId].pendingTasks = [];
      inbox.agents[agentId].lastCheck = new Date().toISOString();

      if (writeInbox(inbox)) {
        return NextResponse.json({
          success: true,
          message: '收件箱已清空'
        });
      }
    }

    return NextResponse.json(
      { error: '操作失败' },
      { status: 500 }
    );
  } catch (e: any) {
    console.error('[Agent Inbox] 错误:', e);
    return NextResponse.json(
      { error: e.message || '操作失败' },
      { status: 500 }
    );
  }
}
