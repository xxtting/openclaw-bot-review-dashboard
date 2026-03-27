import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const CHANNELS_FILE = path.join(OPENCLAW_HOME, "agent-channels.json");

function readChannels(): any[] {
  try {
    if (!fs.existsSync(CHANNELS_FILE)) {
      // 初始化默认频道
      return getDefaultChannels();
    }
    return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf-8"));
  } catch { return getDefaultChannels(); }
}

function getDefaultChannels() {
  return [
    {
      id: "channel-broadcast",
      name: "全局广播",
      emoji: "🛡️",
      description: "MAIN发布指令，所有Agent可见",
      type: "broadcast",
      members: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "channel-engineering",
      name: "工程部",
      emoji: "🏠",
      description: "工程军团内部讨论",
      type: "legion",
      legionId: "legion-engineering",
      members: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "channel-design",
      name: "设计部",
      emoji: "🎨",
      description: "设计军团内部讨论",
      type: "legion",
      legionId: "legion-design",
      members: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "channel-testing",
      name: "测试部",
      emoji: "🧪",
      description: "测试军团内部讨论",
      type: "legion",
      legionId: "legion-testing",
      members: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

function writeChannels(channels: any[]): boolean {
  try {
    const dir = path.dirname(CHANNELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
    return true;
  } catch { return false; }
}

export async function GET() {
  const channels = readChannels();
  return NextResponse.json({ channels });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const channels = readChannels();

    const channel = {
      id: `channel-${Date.now()}`,
      name: body.name || "新频道",
      emoji: body.emoji || "💬",
      description: body.description || "",
      type: body.type || "legion",
      legionId: body.legionId || null,
      projectId: body.projectId || null,
      members: body.members || [],
      isPrivate: body.isPrivate || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    channels.push(channel);
    if (!writeChannels(channels)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, channel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
