import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OPENCLAW_HOME } from '@/lib/openclaw-paths';

const DISPATCH_FILE = path.join(OPENCLAW_HOME, 'lobster-dispatch-queue.json');

// 确保目录存在
function ensureDir() {
  const dir = path.dirname(DISPATCH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 读取分发队列
function readQueue(): any {
  try {
    ensureDir();
    if (!fs.existsSync(DISPATCH_FILE)) {
      return { tasks: [] };
    }
    return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf-8'));
  } catch (e) {
    console.error('[Agent Dispatch] 读取失败:', e);
    return { tasks: [] };
  }
}

// 写入分发队列
function writeQueue(data: any): boolean {
  try {
    ensureDir();
    fs.writeFileSync(DISPATCH_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[Agent Dispatch] 写入失败:', e);
    return false;
  }
}

/**
 * POST - 添加任务分发记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentId,
      taskId,
      taskTitle,
      action, // 'start', 'execute', 'approve', 'reject', 'feedback'
      message,
      legionId,
      legionName
    } = body;

    const queue = readQueue();

    const dispatch = {
      id: `dispatch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      taskId: taskId || null,
      taskTitle: taskTitle || '',
      legionId: legionId || '',
      legionName: legionName || '',
      action: action || 'dispatch',
      message: message || '',
      status: 'pending', // pending, sent, failed, completed
      createdAt: new Date().toISOString(),
      sentAt: null,
      completedAt: null
    };

    queue.tasks.push(dispatch);

    if (writeQueue(queue)) {
      console.log(`[Agent Dispatch] 已添加分发记录: ${agentId} - ${action} - ${taskTitle || '无标题'}`);
      return NextResponse.json({
        success: true,
        data: { dispatch },
        message: '分发记录已添加'
      });
    } else {
      return NextResponse.json(
        { error: '保存失败' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[Agent Dispatch] 错误:', e);
    return NextResponse.json(
      { error: e.message || '操作失败' },
      { status: 500 }
    );
  }
}

/**
 * GET - 获取分发队列
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const queue = readQueue();
    let tasks = queue.tasks || [];

    // 过滤
    if (agentId) {
      tasks = tasks.filter((t: any) => t.agentId === agentId);
    }

    if (status) {
      tasks = tasks.filter((t: any) => t.status === status);
    }

    // 按时间倒序
    tasks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 限制数量
    tasks = tasks.slice(0, limit);

    // 统计
    const stats = {
      total: (queue.tasks || []).length,
    pending: (queue.tasks || []).filter((t: any) => t.status === 'pending').length,
      sent: (queue.tasks || []).filter((t: any) => t.status === 'sent').length,
      completed: (queue.tasks || []).filter((t: any) => t.status === 'completed').length,
      failed: (queue.tasks || []).filter((t: any) => t.status === 'failed').length
    };

    return NextResponse.json({
      success: true,
      data: {
        tasks,
        stats
      },
      message: '获取成功'
    });
  } catch (e: any) {
    console.error('[Agent Dispatch] 错误:', e.g);
    return NextResponse.json(
      { error: e.message || '获取失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 清理分发队列
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const beforeDays = parseInt(searchParams.get('beforeDays') || '7');

    const queue = readQueue();
    const originalLength = queue.tasks.length;

    // 删除指定天数前的记录
    const cutoffTime = Date.now() - beforeDays * 24 * 60 * 60 * 1000;
    queue.tasks = queue.tasks.filter((t: any) => new Date(t.createdAt).getTime() > cutoffTime);

    if (writeQueue(queue)) {
      return NextResponse.json({
        success: true,
        message: '清理完成',
        removed: originalLength - queue.tasks.length
      });
    } else {
      return NextResponse.json(
        { error: '保存失败' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[Agent Dispatch] 错误:', e);
    return NextResponse.json(
      { error: e.message || '操作失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT - 更新分发记录状态
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      status, // pending, sent, failed, completed
      sentAt,
      completedAt,
      result
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id 不能为空' },
        { status: 400 }
      );
    }

    const queue = readQueue();
    const task = queue.tasks.find((t: any) => t.id === id);

    if (!task) {
      return NextResponse.json(
        { error: '记录不存在' },
        { status: 404 }
      );
    }

    // 更新字段
    if (status) task.status = status;
    if (sentAt) task.sentAt = sentAt;
    if (completedAt) task.completedAt = completedAt;
    if (result) task.result = result;

    if (writeQueue(queue)) {
      return NextResponse.json({
        success: true,
        data: { task },
        message: '更新成功'
      });
    } else {
      return NextResponse.json(
        { error: '保存失败' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[Agent Dispatch] 错误:', e);
    return NextResponse.json(
      { error: e.message || '操作失败' },
      { status: 500 }
    );
  }
}
