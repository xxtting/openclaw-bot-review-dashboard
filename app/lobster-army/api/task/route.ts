import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");

function readTasks(): any[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch { return []; }
}

function writeTasks(tasks: any[]): boolean {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const legionId = searchParams.get("legionId");
  const status = searchParams.get("status");

  let tasks = readTasks();

  if (legionId) {
    tasks = tasks.filter((t: any) => t.legionId === legionId);
  }
  if (status) {
    tasks = tasks.filter((t: any) => t.status === status);
  }

  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasks = readTasks();

    const task = {
      id: `task-${Date.now()}`,
      legionId: body.legionId || "",
      title: body.title || "新任务",
      description: body.description || "",
      assigneeId: body.assigneeId || null,
      assigneeName: body.assigneeName || "",
      status: "pending",
      priority: body.priority || "P1",
      fromBoss: body.fromBoss || false,
      tags: body.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tasks.push(task);
    if (!writeTasks(tasks)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, task });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, ...updates } = body;
    const tasks = readTasks();
    const idx = tasks.findIndex((t: any) => t.id === taskId);

    if (idx === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    tasks[idx] = {
      ...tasks[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (!writeTasks(tasks)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: tasks[idx] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json({ error: "缺少任务ID" }, { status: 400 });
    }

    const tasks = readTasks();
    const idx = tasks.findIndex((t: any) => t.id === taskId);

    if (idx === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const deletedTask = tasks.splice(idx, 1)[0];

    if (!writeTasks(tasks)) {
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedTask });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
