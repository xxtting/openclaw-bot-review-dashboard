import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const MESSAGES_FILE = path.join(OPENCLAW_HOME, "agent-messages.json");
const MEMORY_FILE = path.join(OPENCLAW_HOME, "agent-memory.json");

function readMessages(): any[] {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return [];
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"));
  } catch { return []; }
}

function writeMessages(messages: any[]): boolean {
  try {
    const dir = path.dirname(MESSAGES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    return true;
  } catch { return false; }
}

function readMemory(): any[] {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  } catch { return []; }
}

function writeMemory(memory: any[]): boolean {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    return true;
  } catch { return false; }
}

// GET: 获取频道消息
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const limit = parseInt(searchParams.get("limit") || "50");

  let messages = readMessages();

  if (channelId) {
    messages = messages.filter((m: any) => m.channelId === channelId);
  }

  // 按时间倒序，返回最近limit条
  messages = messages.slice(-limit).reverse();
  const memory = readMemory();

  return NextResponse.json({ messages, memory });
}

// POST: 发送消息
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = readMessages();

    // 解析@提及
    const mentionMatches = body.content?.match(/@(\w+)/g) || [];
    const mentions = mentionMatches.map((m: string) => m.slice(1));

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      channelId: body.channelId,
      senderId: body.senderId || "main",
      senderName: body.senderName || "MAIN",
      senderEmoji: body.senderEmoji || "🦞",
      senderRole: body.senderRole || "指挥官",
      type: body.type || "normal",
      content: body.content || "",
      mentions,
      reactions: {},
      attachments: body.attachments || [],
      relatedTaskId: body.relatedTaskId || null,
      isFromBoss: body.isFromBoss || false,
      createdAt: new Date().toISOString(),
    };

    messages.push(message);

    // 如果是系统消息或指令，同步更新记忆
    if (message.type === "system" || message.type === "command") {
      const memory = readMemory();
      memory.push({
        id: `mem-${Date.now()}`,
        channelId: message.channelId,
        key: `msg-${message.id}`,
        summary: message.content.slice(0, 100),
        context: message.content,
        importance: "medium",
        agentIds: mentions,
        createdAt: message.createdAt,
      });
      // 保留最近500条记忆
      if (memory.length > 500) memory.splice(0, memory.length - 500);
      writeMemory(memory);
    }

    if (!writeMessages(messages)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
