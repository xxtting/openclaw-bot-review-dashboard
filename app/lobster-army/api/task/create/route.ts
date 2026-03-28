import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      title, 
      description, 
      assignee, 
      priority, 
      deadline, 
      tags,
      dependencies 
    } = body;

    // 验证必填字段
    if (!title) {
      return NextResponse.json(
        { error: '任务标题不能为空' },
        { status: 400 }
      );
    }

    // 生成任务ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const task = {
      id: taskId,
      title,
      description: description || '',
      assignee: assignee || null,
      priority: priority || 'P2', // P0, P1, P2
      status: 'pending', // pending, in-progress, completed, blocked
      deadline: deadline || null,
      tags: tags || [],
      dependencies: dependencies || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0
    };

    // 这里应该保存到数据库或文件系统
    // 暂时返回成功响应
    console.log('[Task Create] 任务已创建:', taskId);

    return NextResponse.json({
      success: true,
      data: {
        task
      },
      message: '任务创建成功'
    });
  } catch (error) {
    console.error('[Task Create] 错误:', error);
    return NextResponse.json(
      { error: '任务创建失败' },
      { status: 500 }
    );
  }
}

// GET 方法用于获取任务创建表单配置
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      priorities: [
        { value: 'P0', label: '紧急', color: 'red' },
        { value: 'P1', label: '高', color: 'orange' },
        { value: 'P2', label: '中', color: 'blue' },
        { value: 'P3', label: '低', color: 'gray' }
      ],
      assignees: [
        { id: 'dev-lead', name: '凌霄 (开发主管)', role: 'dev-lead' },
        { id: 'architect', name: '云图 (架构师)', role: 'architect' },
        { id: 'frontend-dev', name: '星轨 (前端工程师)', role: 'frontend' },
        { id: 'backend-dev', name: '核芯 (后端工程师)', role: 'backend' },
        { id: 'fullstack-dev', name: '翼展 (全栈工程师)', role: 'fullstack' },
        { id: 'qa-engineer', name: '探微 (测试工程师)', role: 'qa' }
      ],
      tags: [
        'feature', 'bugfix', 'optimization', 'refactor', 
        'documentation', 'testing', 'deployment'
      ]
    }
  });
}
