import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const DATA_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");

function readData(): any {
  try {
    if (!fs.existsSync(DATA_FILE)) return { legions: [], agents: [], projects: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch { return { legions: [], agents: [], projects: [] }; }
}

function writeData(data: any) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Write lobster data error:", e);
    return false;
  }
}

export async function GET() {
  const data = readData();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = readData();

    if (body.type === "legion") {
      const legion = {
        id: `legion-${Date.now()}`,
        name: body.name || "新军团",
        emoji: body.emoji || "🎖️",
        leaderId: body.leaderId || "",
        memberIds: body.memberIds || [],
        status: "idle",
        workflowSteps: body.workflowSteps || [
          { id: "step-1", name: "执行", type: "execute" },
          { id: "step-2", name: "审核", type: "review" },
          { id: "step-3", name: "存档", type: "archive" },
        ],
        color: body.color || "#00d4aa",
        createdAt: new Date().toISOString(),
      };
      data.legions.push(legion);
    } else if (body.type === "agent") {
      const agent = {
        id: body.id || `agent-${Date.now()}`,
        name: body.name || "新Agent",
        emoji: body.emoji || "🛡️",
        role: body.role || "成员",
        status: body.status || "offline",
        legionId: body.legionId || "",
        parentId: body.parentId || null,
        childIds: [],
        currentTask: null,
        taskQueue: [],
        createdAt: new Date().toISOString(),
      };
      data.agents.push(agent);
    } else if (body.type === "project") {
      const project = {
        id: `project-${Date.now()}`,
        name: body.name || "新项目",
        description: body.description || "",
        status: "active",
        legionIds: body.legionIds || [],
        taskIds: [],
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.projects.push(project);
    }

    if (!writeData(data)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
