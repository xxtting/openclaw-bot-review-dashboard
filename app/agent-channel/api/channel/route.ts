import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const CHANNELS_FILE = path.join(OPENCLAW_HOME, "agent-channels.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");

function readChannels(): any[] {
  try {
    if (!fs.existsSync(CHANNELS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf-8"));
  } catch { return []; }
}

function readLegions(): { legions: any[]; agents: any[]; projects: any[] } {
  try {
    if (!fs.existsSync(LEGIONS_FILE)) return { legions: [], agents: [], projects: [] };
    return JSON.parse(fs.readFileSync(LEGIONS_FILE, "utf-8"));
  } catch { return { legions: [], agents: [], projects: [] }; }
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
  const savedChannels = readChannels();
  const { legions } = readLegions();

  // 固定广播频道
  const broadcastChannel = savedChannels.find((c) => c.type === "broadcast") || {
    id: "channel-broadcast",
    name: "全局广播",
    emoji: "🛡️",
    description: "MAIN发布指令，所有Agent可见",
    type: "broadcast",
    members: [],
    isPrivate: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 动态生成军团频道（基于lobster-legions.json）
  const legionChannels = legions.map((legion: any) => {
    const existing = savedChannels.find((c) => c.legionId === legion.id);
    return existing || {
      id: `channel-legion-${legion.id}`,
      name: `${legion.emoji} ${legion.name}`,
      emoji: legion.emoji,
      description: `${legion.name} 内部讨论频道`,
      type: "legion",
      legionId: legion.id,
      members: [],
      isPrivate: false,
      createdAt: legion.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // 保留非legion/broadcast的自定义频道
  const customChannels = savedChannels.filter(
    (c) => c.type !== "legion" && c.type !== "broadcast"
  );

  const channels = [broadcastChannel, ...legionChannels, ...customChannels];
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("id");
    const channels = readChannels();
    const filtered = channels.filter((c) => c.id !== channelId);
    if (filtered.length === channels.length) {
      return NextResponse.json({ error: "频道不存在" }, { status: 404 });
    }
    if (!writeChannels(filtered)) {
      return NextResponse.json({ error: "删除失败" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
