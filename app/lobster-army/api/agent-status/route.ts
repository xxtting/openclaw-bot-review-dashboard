import { NextRequest, NextResponse } from 'next/server';

// Agent 状态定义
interface AgentStatus {
  agentId: string;
  name: string;
  avatar: string;
  role: string;
  status: 'online' | 'busy' | 'offline' | 'error';
  lastHeartbeat: number;
  currentTask?: string;
  memoryUsage?: number;
  cpuUsage?: number;
  uptime?: number;
}

// 模拟 agent 状态数据 (生产环境应从实际 agent 获取)
const AGENT_STATUS: AgentStatus[] = [
  {
    agentId: 'dev-lead',
    name: '凌霄',
    avatar: '👨‍💻',
    role: 'dev-lead',
    status: 'online',
    lastHeartbeat: Date.now() - 120000, // 2分钟前
    currentTask: 'Lobster Army 集成开发',
    memoryUsage: 256,
    cpuUsage: 15,
    uptime: 86400000 // 1天
  },
  {
    agentId: 'architect',
    name: '云图',
    avatar: '🏗️',
    role: 'architect',
    status: 'online',
    lastHeartbeat: Date.now() - 300000, // 5分钟前
    currentTask: '技术方案设计',
    memoryUsage: 128,
    cpuUsage: 8,
    uptime: 86400000
  },
  {
    agentId: 'frontend-dev',
    name: '星轨',
    avatar: '🎨',
    role: 'frontend-dev',
    status: 'busy',
    lastHeartbeat: Date.now() - 60000, // 1分钟前
    currentTask: '前端界面开发',
    memoryUsage: 512,
    cpuUsage: 25,
    uptime: 72000000 // 20小时
  },
  {
    agentId: 'backend-dev',
    name: '核芯',
    avatar: '⚙️',
    role: 'backend-dev',
    status: 'online',
    lastHeartbeat: Date.now() - 180000, // 3分钟前
    currentTask: 'API 开发',
    memoryUsage: 384,
    cpuUsage: 12,
    uptime: 86400000
  },
  {
    agentId: 'fullstack-dev',
    name: '翼展',
    avatar: '🦅',
    role: 'fullstack-dev',
    status: 'online',
    lastHeartbeat: Date.now() - 90000, // 1.5分钟前
    currentTask: '功能模块集成',
    memoryUsage: 640,
    cpuUsage: 18,
    uptime: 82800000
  },
  {
    agentId: 'qa-engineer',
    name: '探微',
    avatar: '🔍',
    role: 'qa-engineer',
    status: 'online',
    lastHeartbeat: Date.now() - 240000, // 4分钟前
    currentTask: '测试用例编写',
    memoryUsage: 192,
    cpuUsage: 10,
    uptime: 79200000
  }
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');
  const role = searchParams.get('role');

  let agents = [...AGENT_STATUS];

  // 过滤
  if (agentId) {
    agents = agents.filter(a => a.agentId === agentId);
  }

  if (role) {
    agents = agents.filter(a => a.role === role);
  }

  // 统计信息
  const now = Date.now();
  const stats = {
    total: AGENT_STATUS.length,
    online: AGENT_STATUS.filter(a => a.status === 'online').length,
    busy: AGENT_STATUS.filter(a => a.status === 'busy').length,
    offline: AGENT_STATUS.filter(a => a.status === 'offline').length,
    error: AGENT_STATUS.filter(a => a.status === 'error').length,
    avgMemoryUsage: Math.round(
      AGENT_STATUS.reduce((sum, a) => sum + (a.memoryUsage || 0), 0) / AGENT_STATUS.length
    ),
    avgCpuUsage: Math.round(
      AGENT_STATUS.reduce((sum, a) => sum + (a.cpuUsage || 0), 0) / AGENT_STATUS.length
    )
  };

  return NextResponse.json({
    success: true,
    data: {
      agents,
      stats,
      timestamp: now,
      timestampFormatted: new Date(now).toISOString()
    },
    message: '获取 agent 状态成功'
  });
}

// POST 方法用于更新 agent 状态
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      agentId,
      status,
      currentTask,
      memoryUsage,
      cpuUsage
    } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID 不能为空' },
        { status: 400 }
      );
    }

    // 更新或添加 agent 状态
    const existingIndex = AGENT_STATUS.findIndex(a => a.agentId === agentId);
    
    if (existingIndex >= 0) {
      AGENT_STATUS[existingIndex] = {
        ...AGENT_STATUS[existingIndex],
        status: status || AGENT_STATUS[existingIndex].status,
        lastHeartbeat: Date.now(),
        currentTask: currentTask !== undefined ? currentTask : AGENT_STATUS[existingIndex].currentTask,
        memoryUsage: memoryUsage !== undefined ? memoryUsage : AGENT_STATUS[existingIndex].memoryUsage,
        cpuUsage: cpuUsage !== undefined ? cpuUsage : AGENT_STATUS[existingIndex].cpuUsage
      };
    }

    return NextResponse.json({
      success: true,
      message: 'Agent 状态已更新'
    });
  } catch (error) {
    console.error('[Agent Status Update] 错误:', error);
    return NextResponse.json(
      { error: '状态更新失败' },
      { status: 500 }
    );
  }
}
