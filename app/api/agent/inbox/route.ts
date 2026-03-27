import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");

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

function readInbox(): AgentInbox {
  try {
    if (!fs.existsSync(INBOX_FILE)) {
      return {
        inboxVersion: "1.0",
        lastUpdated: new Date().toISOString(),
        agents: {}
      };
    }
    return JSON.parse(fs.readFileSync(INBOX_FILE, "utf-8"));
  } catch {
    return {
      inboxVersion: "1.0",
      lastUpdated: new Date().toISOString(),
      agents: {}
    };
  }
}

function writeInbox(inbox: AgentInbox): boolean {
  try {
    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch {
    return false;
  }
}

// GET - Agent获取自己的待办任务
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json({ error: "缺少agentId参数" }, { status: 400 });
    }

    const inbox = readInbox();
    
    // 确保该agent有记录
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = {
        pendingTasks: [],
        lastCheck: new Date().toISOString()
      };
    }

    // 更新最后检查时间
    inbox.agents[agentId].lastCheck = new Date().toISOString();
    writeInbox(inbox);

    const pendingTasks = inbox.agents[agentId]?.pendingTasks || [];

    return NextResponse.json({
      success: true,
      agentId,
      pendingTasks,
      count: pendingTasks.length,
      lastCheck: inbox.agents[agentId].lastCheck
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST - 分发任务给Agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, taskId, title, legionId, legionName, priority, message } = body;

    if (!agentId || !taskId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const inbox = readInbox();

    // 确保该agent有记录
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = {
        pendingTasks: [],
        lastCheck: new Date().toISOString()
      };
    }

    // 检查任务是否已存在
    const existingTask = inbox.agents[agentId].pendingTasks.find((t: TaskItem) => t.taskId === taskId);
    if (existingTask) {
      return NextResponse.json({ 
        success: false, 
        message: "任务已存在",
        task: existingTask 
      });
    }

    // 添加新任务
    const newTask: TaskItem = {
      id: `inbox-${Date.now()}`,
      taskId,
      title: title || "新任务",
      legionId: legionId || "",
      legionName: legionName || "",
      priority: priority || "P1",
      status: "pending",
      createdAt: new Date().toISOString(),
      message: message || ""
    };

    inbox.agents[agentId].pendingTasks.push(newTask);
    inbox.lastUpdated = new Date().toISOString();

    if (!writeInbox(inbox)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `任务已发送给 ${agentId}`,
      task: newTask 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE - Agent确认完成任务，从队列中移除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const inboxTaskId = searchParams.get("inboxTaskId");

    if (!agentId || !inboxTaskId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const inbox = readInbox();

    if (!inbox.agents[agentId]) {
      return NextResponse.json({ error: "Agent不存在" }, { status: 404 });
    }

    const taskIndex = inbox.agents[agentId].pendingTasks.findIndex((t: TaskItem) => t.id === inboxTaskId);
    if (taskIndex === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    inbox.agents[agentId].pendingTasks.splice(taskIndex, 1);
    inbox.lastUpdated = new Date().toISOString();

    if (!writeInbox(inbox)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "任务已确认" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
