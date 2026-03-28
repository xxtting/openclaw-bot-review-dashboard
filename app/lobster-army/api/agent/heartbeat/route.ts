import { NextRequest, NextResponse } from 'next/server';

// 存储 agent 心跳记录 (生产环境应使用数据库)
const HEARTBEAT_STORE = new Map<string, {
  lastSeen: number;
  status: string;
  message?: string;
}>();

// 心跳超时阈值 (毫秒)
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5分钟

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      agentId, 
      status = 'online',
      message 
    } = body;

    // 验证必填字段
    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID 不能为空' },
        { status: 400 }
      );
    }

    const now = Date.now();
    
    // 更新心跳记录
    HEARTBEAT_STORE.set(agentId, {
      lastSeen: now,
      status,
      message
    });

    console.log(`[Agent Heartbeat] ${agentId} - ${status} - ${new Date(now).toISOString()}`);

    return NextResponse.json({
      success: true,
      data: {
        agentId,
        lastSeen: now,
        status,
        acknowledged: true
      },
      message: '心跳已接收'
    });
  } catch (error) {
    console.error('[Agent Heartbeat] 错误:', error);
    return NextResponse.json(
      { error: '心跳处理失败' },
      { status: 500 }
    );
  }
}

// GET 方法用于获取所有 agent 的状态
export async function GET() {
  const now = Date.now();
  const agents = Array.from(HEARTBEAT_STORE.entries()).map(([agentId, data]) => {
    const isOnline = now - data.lastSeen < HEARTBEAT_TIMEOUT;
    return {
      agentId,
      status: isOnline ? data.status : 'offline',
      lastSeen: data.lastSeen,
      lastSeenAt: new Date(data.lastSeen).toISOString(),
      isOnline,
      message: data.message,
      uptime: now - data.lastSeen
    };
  });

  // 统计信息
  const stats = {
    total: agents.length,
    online: agents.filter(a => a.isOnline && a.status === 'online').length,
    busy: agents.filter(a => a.isOnline && a.status === 'busy').length,
    offline: agents.filter(a => !a.isOnline).length
  };

  return NextResponse.json({
    success: true,
    data: {
      agents,
      stats
    },
    message: '获取 agent 状态成功'
  });
}

// DELETE 方法用于清理离线 agent
export async function DELETE() {
  const now = Date.now();
  let cleaned = 0;

  for (const [agentId, data] of HEARTBEAT_STORE.entries()) {
    if (now - data.lastSeen > HEARTBEAT_TIMEOUT) {
      HEARTBEAT_STORE.delete(agentId);
      cleaned++;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      cleaned
    },
    message: `已清理 ${cleaned} 个离线 agent`
  });
}
