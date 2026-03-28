import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

// Agent通知队列文件
const NOTIFICATION_QUEUE = path.join(OPENCLAW_HOME, "lobster-agent-notifications.json");

function readQueue(): any[] {
  try {
    if (!fs.existsSync(NOTIFICATION_QUEUE)) return [];
    return JSON.parse(fs.readFileSync(NOTIFICATION_QUEUE, "utf-8"));
  } catch { return []; }
}

function writeQueue(queue: any[]): boolean {
  try {
    const dir = path.dirname(NOTIFICATION_QUEUE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NOTIFICATION_QUEUE, JSON.stringify(queue, null, 2));
    return true;
  } catch { return false; }
}

// POST - 发送通知给Agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, taskId, message, action, taskTitle } = body;

    if (!agentId) {
      return NextResponse.json({ error: "缺少agentId" }, { status: 400 });
    }

    const notification = {
      id: `notif-${Date.now()}`,
      agentId,
      taskId,
      taskTitle: taskTitle || "",
      message: message || "📬 新通知",
      action: action || "check_inbox",
      status: "pending",
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    };

    const queue = readQueue();
    queue.push(notification);

    if (!writeQueue(queue)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    // 尝试立即触发Agent（如果配置了命令）
    // 这里可以实现各种触发方式：
    // 1. 调用OpenClaw CLI: openclaw agent invoke ${agentId} --message
    // 2. 通过WebSocket通知
    // 3. 发送到消息队列（Redis/RabbitMQ）

    console.log(`🔔 通知已发送给Agent[${agentId}]: ${message}`);

    return NextResponse.json({
      success: true,
      notification,
      message: "通知已发送"
    });
  } catch (e: any) {
    console.error("发送通知失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET - 获取Agent的通知
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    const queue = readQueue();

    if (agentId) {
      // 获取特定Agent的通知
      const agentNotifications = queue.filter(n => n.agentId === agentId);
      return NextResponse.json({ notifications: agentNotifications });
    }

    // 获取所有通知
    return NextResponse.json({ notifications: queue });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE - 标记通知为已处理
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get("notificationId");
    const agentId = searchParams.get("agentId");

    if (!notificationId && !agentId) {
      return NextResponse.json({ error: "缺少notificationId或agentId" }, { status: 400 });
    }

    let queue = readQueue();

    if (notificationId) {
      // 删除特定通知
      queue = queue.filter(n => n.id !== notificationId);
    } else if (agentId) {
      // 删除Agent的所有通知
      queue = queue.filter(n => n.agentId !== agentId);
    }

    if (!writeQueue(queue)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "通知已清除" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
