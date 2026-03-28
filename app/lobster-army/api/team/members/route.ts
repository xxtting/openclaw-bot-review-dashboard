import { NextResponse } from 'next/server';

// 团队成员数据 (暂时硬编码，后续可从配置文件读取)
const TEAM_MEMBERS = [
  {
    id: 'dev-lead',
    name: '凌霄',
    role: 'dev-lead',
    roleName: '开发主管',
    avatar: '👨‍💻',
    status: 'online', // online, busy, offline
    skills: ['技术架构', '任务管理', '代码审查'],
    currentTask: 'Lobster Army 集成开发',
    joinDate: '2026-03-26',
    email: 'dev-lead@openclaw.team',
    location: 'CN'
  },
  {
    id: 'architect',
    name: '云图',
    role: 'architect',
    roleName: '架构师',
    avatar: '🏗️',
    status: 'online',
    skills: ['系统架构', '技术选型', '性能优化'],
    currentTask: 'Lobster Army 技术方案设计',
    joinDate: '2026-03-26',
    'email': 'architect@openclaw.team',
    location: 'CN'
  },
  {
    id: 'frontend-dev',
    name: '星轨',
    role: 'frontend-dev',
    roleName: '前端工程师',
    avatar: '🎨',
    status: 'online',
    skills: ['React/Next.js', 'UI/UX设计', '前端架构'],
    currentTask: 'Lobster Army 前端界面开发',
    joinDate: '2026-03-26',
    email: 'frontend@openclaw.team',
    location: 'CN'
  },
  {
    id: 'backend-dev',
    name: '核芯',
    role: 'backend-dev',
    roleName: '后端工程师',
    avatar: '⚙️',
    status: 'busy',
    skills: ['Node.js', 'API设计', '数据库'],
    currentTask: 'Lobster Army API 开发',
    joinDate: '2026-03-26',
    email: 'backend@openclaw.team',
    location: 'CN'
  },
  {
    id: 'fullstack-dev',
    name: '翼展',
    role: 'fullstack-dev',
    roleName: '全栈工程师',
    avatar: '🦅',
    status: 'online',
    skills: ['全栈开发', '集成开发', '性能调优'],
    currentTask: 'Lobster Army 功能模块集成',
    joinDate: '2026-03-26',
    email: 'fullstack@openclaw.team',
    location: 'CN'
  },
  {
    id: 'qa-engineer',
    name: '探微',
    role: 'qa-engineer',
    roleName: '测试工程师',
    avatar: '🔍',
    status: 'online',
    skills: ['自动化测试', '质量把控', '性能测试'],
    currentTask: 'Lobster Army 测试用例编写',
    joinDate: '2026-03-26',
    email: 'qa@openclaw.team',
    location: 'CN'
  }
];

export async function GET() {
  // 获取查询参数
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const status = searchParams.get('status');

  // 过滤成员
  let members = [...TEAM_MEMBERS];
  
  if (role) {
    members = members.filter(m => m.role === role);
  }
  
  if (status) {
    members = members.filter(m => m.status === status);
  }

  // 统计信息
  const stats = {
    total: TEAM_MEMBERS.length,
    online: TEAM_MEMBERS.filter(m => m.status === 'online').length,
    busy: TEAM_MEMBERS.filter(m => m.status === 'busy').length,
    offline: TEAM_MEMBERS.filter(m => m.status === 'offline').length
  };

  return NextResponse.json({
    success: true,
    data: {
      members,
      stats
    },
    message: '获取团队成员成功'
  });
}
