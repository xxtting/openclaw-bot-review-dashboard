import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const REPORT_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "report-queue.json");

interface Report {
  id: number;
  type: "task_started" | "task_completed" | "task_failed" | "step_executed";
  legionId: string;
  legionName: string;
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentName: string;
  stepName?: string;
  message: string;
  priority: string;
  status: string;
  createdAt: string;
  reportedToMain: boolean;
  sentToBoss: boolean;
}

interface ReportData {
  reports: Report[];
  lastReportId: number;
}

function readReports(): ReportData {
  try {
    if (!fs.existsSync(REPORT_FILE)) {
      return { reports: [], lastReportId: 0 };
    }
    return JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
  } catch {
    return { reports: [], lastReportId: 0 };
  }
}

function writeReports(data: ReportData): boolean {
  try {
    const dir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * 添加汇报记录
 */
function addReport(report: Omit<Report, "id" | "createdAt" | "reportedToMain" | "sentToBoss">): Report {
  const data = readReports();
  const newReport: Report = {
    ...report,
    id: ++data.lastReportId,
    createdAt: new Date().toISOString(),
    reportedToMain: false,
    sentToBoss: false
  };
  data.reports.push(newReport);
  writeReports(data);
  return newReport;
}

/**
 * GET /lobster-army/api/report
 * 获取待汇报给MAIN的记录
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unReported = searchParams.get("unReported") === "true";
    const limit = parseInt(searchParams.get("limit") || "10");
    const taskId = searchParams.get("taskId");

    const data = readReports();
    let reports = data.reports;

    // 按时间倒序
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 筛选未汇报的
    if (unReported) {
      reports = reports.filter(r => !r.reportedToMain);
    }

    // 按任务ID筛选
    if (taskId) {
      reports = reports.filter(r => r.taskId === taskId);
    }

    // 限制数量
    reports = reports.slice(0, limit);

    return NextResponse.json({
      success: true,
      reports,
      count: reports.length,
      totalUnReported: data.reports.filter(r => !r.reportedToMain).length
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /lobster-army/api/report
 * 创建汇报记录（任务开始/结束/步骤执行时调用）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      legionId,
      legionName,
      taskId,
      taskTitle,
      agentId,
      agentName,
      stepName,
      message,
      priority,
      status
    } = body;

    if (!type || !taskId || !agentId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const report = addReport({
      type,
      legionId: legionId || "",
      legionName: legionName || "",
      taskId,
      taskTitle: taskTitle || "",
      agentId,
      agentName: agentName || agentId,
      stepName,
      message: message || "",
      priority: priority || "P1",
      status: status || "pending"
    });

    return NextResponse.json({
      success: true,
      report,
      message: `汇报已记录: ${type}`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PUT /lobster-army/api/report
 * 标记汇报为已处理
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportIds, action } = body;

    if (!reportIds || !Array.isArray(reportIds)) {
      return NextResponse.json({ error: "缺少reportIds参数" }, { status: 400 });
    }

    const data = readReports();
    let updated = 0;

    for (const id of reportIds) {
      const report = data.reports.find(r => r.id === id);
      if (report) {
        if (action === "reported" || action === "markReported") {
          report.reportedToMain = true;
        } else if (action === "sent" || action === "markSent") {
          report.sentToBoss = true;
        }
        updated++;
      }
    }

    writeReports(data);

    return NextResponse.json({
      success: true,
      updated,
      message: `已更新 ${updated} 条汇报记录`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
