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
      const defaultSteps = [
        { id: "step-1", name: "执行", type: "execute" },
        { id: "step-2", name: "审核", type: "review" },
        { id: "step-3", name: "存档", type: "archive" },
      ];
      const legion = {
        id: `legion-${Date.now()}`,
        name: body.name || "新军团",
        emoji: body.emoji || "🎖️",
        leaderId: body.leaderId || "",
        memberIds: body.memberIds || [],
        status: "idle",
        workflowSteps: body.workflowSteps || defaultSteps,
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

      // Auto-add agent to legion's memberIds when legionId is set
      if (agent.legionId) {
        const legion = data.legions.find((l: any) => l.id === agent.legionId);
        if (legion && !legion.memberIds.includes(agent.id)) {
          legion.memberIds.push(agent.id);
        }
      }
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const data = readData();

    if (body.type === "legion_member") {
      const { legionId, agentId, action } = body;
      const legion = data.legions.find((l: any) => l.id === legionId);
      if (!legion) return NextResponse.json({ error: "军团不存在" }, { status: 404 });

      if (action === "add") {
        if (!legion.memberIds.includes(agentId)) {
          legion.memberIds.push(agentId);
        }
        const agent = data.agents.find((a: any) => a.id === agentId);
        if (agent) agent.legionId = legionId;
      } else if (action === "remove") {
        legion.memberIds = legion.memberIds.filter((id: string) => id !== agentId);
        const agent = data.agents.find((a: any) => a.id === agentId);
        if (agent) agent.legionId = "";
      }
    } else if (body.type === "legion") {
      const idx = data.legions.findIndex((l: any) => l.id === body.id);
      if (idx >= 0) {
        // 只更新 workflowSteps 字段，避免 type 等元数据污染
        if (body.workflowSteps !== undefined && Array.isArray(body.workflowSteps)) {
          const cleanedSteps = body.workflowSteps
            .filter((s: any) => s && s.id && s.name && s.type)
            .map((s: any) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              assigneeId: s.assigneeId || undefined
            }));
          data.legions[idx].workflowSteps = cleanedSteps;
        }
      }
    } else if (body.type === "agent") {
      const idx = data.agents.findIndex((a: any) => a.id === body.id);
      if (idx >= 0) {
        data.agents[idx] = { ...data.agents[idx], ...body };
      }
    }

    if (!writeData(data)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");
    const data = readData();

    if (type === "legion") {
      const idx = data.legions.findIndex((l: any) => l.id === id);
      if (idx < 0) return NextResponse.json({ error: "军团不存在" }, { status: 404 });
      data.legions.splice(idx, 1);
      // 清空属于该军团的agents的legionId
      data.agents.forEach((a: any) => {
        if (a.legionId === id) a.legionId = "";
      });
    } else if (type === "agent") {
      const idx = data.agents.findIndex((a: any) => a.id === id);
      if (idx < 0) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
      data.agents.splice(idx, 1);
      // 从所有军团的memberIds中移除
      data.legions.forEach((l: any) => {
        l.memberIds = l.memberIds.filter((mid: string) => mid !== id);
        if (l.leaderId === id) l.leaderId = "";
      });
    }

    if (!writeData(data)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
