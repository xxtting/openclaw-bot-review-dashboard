import { NextRequest, NextResponse } from 'next/server';

// 存储报告记录
const REPORT_STORE = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      type, // 'daily', 'weekly', 'project', 'task'
      source, // agent ID
      title,
      content,
      metadata = {}
    } = body;

    if (!type || !source || !title) {
      return NextResponse.json(
        { error: '缺少必填字段 (type, source, title)' },
        { status: 400 }
      );
    }

    const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const report = {
      id: reportId,
      type,
      source,
      title,
      content: content || '',
      metadata,
      createdAt: new Date().toISOString(),
      status: 'pending' // pending, sent, failed
    };

    REPORT_STORE.set(reportId, report);

    console.log(`[Report to Main] ${type} 报告已创建 - ${reportId}`);

    // 这里可以触发发送给 OpenClaw Main 的逻辑
    // 例如通过 WebSocket、SSE 或消息队列推送

    return NextResponse.json({
      success: true,
      data: {
        report
      },
      message: '报告已创建，等待发送'
    });
  } catch (error) {
    console.error('[Report to Main] 错误:', error);
    return NextResponse.json(
      { error: '报告创建失败' },
      { status: 500 }
    );
  }
}

// GET 方法用于获取报告列表
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const source = searchParams.get('source');
  const status = searchParams.get('status');

  let reports = Array.from(REPORT_STORE.values());

  if (type) {
    reports = reports.filter(r => r.type === type);
  }

  if (source) {
    reports = reports.filter(r => r.source === source);
  }

  if (status) {
    reports = reports.filter(r => r.status === status);
  }

  // 按时间倒序
  reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    success: true,
    data: {
      reports,
      total: reports.length
    },
    message: '获取报告列表成功'
  });
}
