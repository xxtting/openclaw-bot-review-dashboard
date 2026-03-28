import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const INBOX_FILE = path.join(OPENCLAW_HOME, "lobster-agent-inbox", "agent-inbox.json");
const DISPATCH_FILE = path.join(OPENCLAW_HOME, "lobster-dispatch-queue.json");

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "archive" | "deploy" | "test";
  assigneeId?: string;
  conditionType?: "none" | "pass" | "fail";
  failNext?: number | null;
}

interface Task {
  id: string;
  legionId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  status: "pending" | "in_progress" | "review" | "archived" | "done";
  priority: "P0" | "P1" | "P2";
  currentStep?: number;
  workflowSteps?: WorkflowStep[];
  fromBoss?: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  executionLog?: ExecutionLog[];
  executionResult?: string;
}

interface ExecutionLog {
  stepId: string;
  stepName: string;
  stepType: string;
  executedBy?: string;
  executedAt: string;
  result: "success" | "failed" | "pending";
  notes?: string;
  agentOutput?: string;
}

type ReportType = "task_started" | "task_completed" | "task_failed" | "step_executed" | "step_approved" | "step_rejected";

function readTasks(): Task[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch { return []; }
}

function writeTasks(tasks: Task[]): boolean {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch { return false; }
}

function readLegions(): any {
  try {
    if (!fs.existsSync(LEGIONS_FILE)) return { legions: [], agents: [] };
    return JSON.parse(fs.readFileSync(LEGIONS_FILE, "utf-8"));
  } catch { return { legions: [], agents: [] }; }
}

/**
 * 触发 OpenClaw Agent 执行任务
 */
/**
 * 触发 OpenClaw Agent 执行任务（改进版）
 * 
 * 改进点：
 * 1. 使用 execSync 同步执行，等待完整结果
 * 2. 正确捕获 stdout 和 stderr
 * 3. 过滤插件日志噪声
 */
async function triggerOpenClawAgent(agentId: string, task: Task, stepName?: string): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      // 构建发送给 Agent 的消息
      const message = `🦞 龙虾军团任务通知！

任务标题：${task.title}
${task.description ? `任务描述：${task.description}` : ""}
${stepName ? `当前步骤：${stepName}` : ""}

请立即执行这个任务，完成后输出执行结果。`;

      // 使用 execSync 同步执行，等待完整结果
      const command = `openclaw agent --agent ${agentId} --message "${message.replace(/"/g, '\\"')}" --timeout 300`;
      
      console.log(`🚀 触发Agent: ${agentId}`);
      console.log(`📝 任务: ${task.title}`);

      const result = execSync(command, { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 300000, // 5分钟超时
        stdio: ['pipe', 'pipe', 'pipe'] // 捕获 stdout 和 stderr
      });

      // 过滤插件日志噪声
      const output = filterAgentOutput(result);
      console.log(`✅ Agent执行成功，输出长度: ${output.length}`);
      resolve({ success: true, output });

    } catch (e: any) {
      // 错误情况下也尝试获取输出
      let output = '';
      if (e.stdout) output += e.stdout;
      if (e.stderr) output += e.stderr;
      
      console.error(`⚠️ Agent执行完成但有错误: ${e.message}`);
      resolve({ 
        success: false, 
        output: filterAgentOutput(output),
        error: e.message 
      });
    }
  });
}

/**
 * 过滤插件注册日志等噪声，只保留实际Agent输出
 */
function filterAgentOutput(output: string): string {
  if (!output) return '';
  
  const lines = output.split('\n');
  const filteredLines = [];
  let inRealOutput = false;
  
  for (const line of lines) {
    // 跳过插件注册行
    if (line.startsWith('[plugins]') || line.includes('Registered feishu_') || line.includes('Registered ')) {
      continue;
    }
    
    // 跳过空行直到遇到真实内容
    if (!inRealOutput && (line.trim() === '' || line.startsWith('🦞') || line.startsWith('['))) {
      if (line.startsWith('🦞')) {
        filteredLines.push(line);
        inRealOutput = true;
      }
      continue;
    }
    
    inRealOutput = true;
    filteredLines.push(line);
  }
  
  return filteredLines.join('\n').trim();
}

// 添加任务到Agent收件箱
function addToAgentInbox(agentId: string, task: Task, legion: any, action: string, stepName?: string): boolean {
  try {
    let inbox: any = { agents: {} };
    if (fs.existsSync(INBOX_FILE)) {
      inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf-8"));
    }
    if (!inbox.agents[agentId]) {
      inbox.agents[agentId] = { pendingTasks: [], lastCheck: new Date().toISOString() };
    }
    
    const exists = inbox.agents[agentId].pendingTasks.some((t: any) => t.taskId === task.id);
    if (!exists) {
      const message = action === "start" 
        ? `🦞 新任务：请开始执行「${task.title}」`
        : action === "execute"
        ? `⚡ 执行步骤：${stepName || "执行中"} - 「${task.title}」`
        : `📋 任务更新 - 「${task.title}」`;
      
      inbox.agents[agentId].pendingTasks.push({
        id: `inbox-${Date.now()}`,
        taskId: task.id,
        title: task.title,
        description: task.description,
        legionId: task.legionId,
        legionName: legion?.name || "",
        priority: task.priority,
        status: "pending",
        createdAt: new Date().toISOString(),
        message
      });
    }
    
    const dir = path.dirname(INBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch (e) {
    console.error("添加收件箱失败:", e);
    return false;
  }
}

// 添加到任务分发队列
function addToDispatchQueue(agentId: string, task: Task, action: string, result: string): boolean {
  try {
    let queue: any[] = [];
    if (fs.existsSync(DISPATCH_FILE)) {
      queue = JSON.parse(fs.readFileSync(DISPATCH_FILE, "utf-8"));
    }
    
    queue.push({
      id: `dispatch-${Date.now()}`,
      agentId,
      taskId: task.id,
      taskTitle: task.title,
      action,
      result,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    
    const dir = path.dirname(DISPATCH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISPATCH_FILE, JSON.stringify(queue, null, 2));
    return true;
  } catch (e) {
    console.error("添加分发队列失败:", e);
    return false;
  }
}

// 添加任务汇报记录
function addTaskReport(
  type: ReportType,
  task: Task,
  legion: any,
  agentId: string,
  stepName?: string,
  message?: string,
  agentOutput?: string
): boolean {
  try {
    const REPORT_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "report-queue.json");
    let data: any = { reports: [], lastReportId: 0 };

    if (fs.existsSync(REPORT_FILE)) {
      data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
    }

    if (!data.reports) data.reports = [];
    if (!data.lastReportId) data.lastReportId = 0;

    const report = {
      id: ++data.lastReportId,
      type,
      legionId: task.legionId,
      legionName: legion?.name || "",
      taskId: task.id,
      taskTitle: task.title,
      agentId,
      agentName: agentId,
      stepName: stepName || "",
      message: message || `${type}: ${task.title}`,
      priority: task.priority,
      status: task.status,
      createdAt: new Date().toISOString(),
      reportedToMain: false,
      sentToBoss: false,
      agentOutput: agentOutput || null
    };

    data.reports.push(report);

    const dir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data, null, 2));

    console.log(`📝 汇报已记录: [${type}] ${task.title} by ${agentId}`);
    return true;
  } catch (e) {
    console.error("添加汇报失败:", e);
    return false;
  }
}

// 执行工作流步骤的核心逻辑
async function executeStep(task: Task, stepIndex: number, agentId?: string): Promise<{ success: boolean; message: string; result?: any; agentOutput?: string }> {
  const steps = task.workflowSteps || [];
  const step = steps[stepIndex];

  if (!step) {
    return { success: false, message: `步骤 ${stepIndex + 1} 不存在` };
  }

  const STEP_HANDLERS: Record<string, (task: Task, step: WorkflowStep, agentId?: string) => Promise<{ success: boolean; message: string; result?: any; agentOutput?: string }>> = {
    execute: async (t, s, aId) => {
      // 🔥 关键修复：真正触发 OpenClaw Agent 执行
      if (aId) {
        console.log(`⚡ 开始执行 Agent: ${aId}`);
        const agentResult = await triggerOpenClawAgent(aId, t, s?.name);
        
        if (agentResult.success) {
          return {
            success: true,
            message: `✅ Agent[${aId}] 执行完成: ${t.title}`,
            result: { newStatus: "in_progress" },
            agentOutput: agentResult.output
          };
        } else {
          return {
            success: false,
            message: `❌ Agent[${aId}] 执行失败: ${agentResult.error}`,
            result: { newStatus: "in_progress" }
          };
        }
      }
      
      return {
        success: true,
        message: `⚡ 执行中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    review: async (t, s) => {
      return {
        success: true,
        message: `👀 待审核: ${t.title}`,
        result: { newStatus: "review" }
      };
    },
    test: async (t, s) => {
      return {
        success: true,
        message: `🧪 测试中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    deploy: async (t, s) => {
      return {
        success: true,
        message: `🚀 部署中: ${t.title}`,
        result: { newStatus: "in_progress" }
      };
    },
    archive: async (t, s) => {
      return {
        success: true,
        message: `📦 已存档: ${t.title}`,
        result: { newStatus: "archived" }
      };
    }
  };

  const handler = STEP_HANDLERS[step.type];
  if (!handler) {
    return { success: false, message: `未知的步骤类型: ${step.type}` };
  }

  return handler(task, step, agentId);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, stepIndex, action } = body;

    const tasks = readTasks();
    const taskIdx = tasks.findIndex((t: Task) => t.id === taskId);

    if (taskIdx === -1) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const task = tasks[taskIdx];

    const legionsData = readLegions();
    const legion = legionsData.legions?.find((l: any) => l.id === task.legionId);
    const workflowSteps = legion?.workflowSteps || [
      { id: "step-1", name: "执行", type: "execute", assigneeId: task.assigneeId },
      { id: "step-2", name: "审核", type: "review" },
      { id: "step-3", name: "存档", type: "archive" },
    ];

    if (!task.workflowSteps) {
      task.workflowSteps = workflowSteps;
    }

    if (task.currentStep === undefined) {
      task.currentStep = 0;
    }

    if (action === "next" || action === "execute") {
      const targetStep = stepIndex !== undefined ? stepIndex : task.currentStep ?? 0;
      
      // 获取要执行的 Agent ID
      const steps = task.workflowSteps || [];
      const stepInfo = steps[targetStep];
      const agentId = stepInfo?.assigneeId || task.assigneeId || legion?.leaderId;
      
      const result = await executeStep(task, targetStep, agentId);

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      const log: ExecutionLog = {
        stepId: stepInfo?.id || `step-${targetStep + 1}`,
        stepName: stepInfo?.name || `步骤${targetStep + 1}`,
        stepType: stepInfo?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: result.message,
        agentOutput: result.agentOutput
      };

      task.status = result.result?.newStatus || task.status;
      task.currentStep = targetStep + 1;
      task.updatedAt = new Date().toISOString();
      task.executedAt = new Date().toISOString();
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.executionResult = result.agentOutput;

      if ((task.currentStep ?? 0) >= (task.workflowSteps?.length || 0)) {
        task.status = "done";
      }

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      // 添加汇报记录
      addTaskReport("step_executed", task, legion, agentId || "system", stepInfo?.name, result.message, result.agentOutput);

      return NextResponse.json({
        success: true,
        message: result.message,
        task: tasks[taskIdx],
        log,
        agentOutput: result.agentOutput
      });

    } else if (action === "start") {
      task.status = "in_progress";
      task.currentStep = 0;
      task.updatedAt = new Date().toISOString();
      (task as any).startedAt = new Date().toISOString();

      const steps = task.workflowSteps || [];
      const agentId = task.assigneeId || legion?.leaderId;
      
      const log: ExecutionLog = {
        stepId: steps[0]?.id || "step-1",
        stepName: steps[0]?.name || "开始",
        stepType: steps[0]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: `🚀 任务开始: ${task.title}`
      };
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      // 触发 Agent 执行
      let agentResult: { success: boolean; output?: string; error?: string } | undefined;
      if (agentId) {
        addToAgentInbox(agentId, task, legion, "start");
        addToDispatchQueue(agentId, task, "start", "任务已开始");
        
        // 🔥 关键：启动时也触发 Agent
        agentResult = await triggerOpenClawAgent(agentId, task, steps[0]?.name);
        
        addTaskReport("task_started", task, legion, agentId, steps[0]?.name, 
          agentResult.success ? `🚀 任务已开始，Agent执行中` : `🚀 任务已开始`,
          agentResult.output
        );
      }

      return NextResponse.json({
        success: true,
        message: "任务已开始",
        task: tasks[taskIdx],
        notified: agentId || null,
        reported: true,
        agentOutput: agentResult?.output
      });

    } else if (action === "complete") {
      task.status = "done";
      task.currentStep = task.workflowSteps?.length || 0;
      task.updatedAt = new Date().toISOString();
      (task as any).completedAt = new Date().toISOString();

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      const completeAgentId = task.assigneeId || legion?.leaderId;
      addTaskReport("task_completed", task, legion, completeAgentId || "system", "完成", "✅ 任务已完成");

      return NextResponse.json({
        success: true,
        message: "任务已完成",
        task: tasks[taskIdx],
        reported: true
      });

    } else if (action === "approve") {
      // 🔥 审核通过 - 继续下一步
      const steps = task.workflowSteps || [];
      const currentStepIdx = task.currentStep ?? 0;
      const currentStep = steps[currentStepIdx];

      const log: ExecutionLog = {
        stepId: currentStep?.id || `step-${currentStepIdx + 1}`,
        stepName: currentStep?.name || `步骤${currentStepIdx + 1}`,
        stepType: currentStep?.type || "review",
        executedAt: new Date().toISOString(),
        result: "success",
        notes: `✅ 审核通过: ${body.notes || "通过"}`
      };

      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      // 继续下一步
      const nextStepIdx = currentStepIdx + 1;
      if (nextStepIdx >= steps.length) {
        task.status = "done";
        task.currentStep = steps.length;
      } else {
        task.currentStep = nextStepIdx;
        task.status = "in_progress";
        const nextStep = steps[nextStepIdx];
        const nextAgentId = nextStep?.assigneeId;
        if (nextAgentId) {
          addToAgentInbox(nextAgentId, task, legion, "start", nextStep?.name);
          addToDispatchQueue(nextAgentId, task, "approve", `步骤"${nextStep?.name}"已分配`);
          triggerOpenClawAgent(nextAgentId, task, nextStep?.name).catch(console.error);
        }
      }

      task.updatedAt = new Date().toISOString();
      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      addTaskReport("step_approved", task, legion, currentStep?.assigneeId || "system", currentStep?.name, "✅ 审核通过");

      return NextResponse.json({
        success: true,
        message: `✅ 审核通过${nextStepIdx < steps.length ? `，已进入步骤${nextStepIdx + 1}` : "，任务完成"}`,
        task: tasks[taskIdx],
        branchAction: "approved",
        nextStep: nextStepIdx < steps.length ? nextStepIdx + 1 : null
      });

    } else if (action === "reject") {
      // 🔥 审核不通过 - 返回指定步骤重新执行
      const steps = task.workflowSteps || [];
      const currentStepIdx = task.currentStep ?? 0;
      const currentStep = steps[currentStepIdx];
      let failNextIdx = currentStep?.failNext ?? null;
      if (failNextIdx === null || failNextIdx === undefined) {
        failNextIdx = currentStepIdx;
      }

      const log: ExecutionLog = {
        stepId: currentStep?.id || `step-${currentStepIdx + 1}`,
        stepName: currentStep?.name || `步骤${currentStepIdx + 1}`,
        stepType: currentStep?.type || "review",
        executedAt: new Date().toISOString(),
        result: "failed",
        notes: `❌ 审核不通过: ${body.notes || "未通过"}，返回步骤${failNextIdx + 1}重新执行`
      };

      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);

      task.currentStep = failNextIdx;
      task.status = "in_progress";
      task.updatedAt = new Date().toISOString();

      const failStep = steps[failNextIdx];
      const failAgentId = failStep?.assigneeId;
      if (failAgentId) {
        addToAgentInbox(failAgentId, task, legion, "restart", failStep?.name);
        addToDispatchQueue(failAgentId, task, "reject", `步骤"${failStep?.name}"需要重新执行`);
        triggerOpenClawAgent(failAgentId, task, failStep?.name).catch(console.error);
      }

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      addTaskReport("step_rejected", task, legion, currentStep?.assigneeId || "system", currentStep?.name, `❌ 审核不通过，返回步骤${failNextIdx + 1}重新执行`);

      return NextResponse.json({
        success: true,
        message: `❌ 审核不通过，已返回步骤${failNextIdx + 1}重新执行`,
        task: tasks[taskIdx],
        branchAction: "rejected",
        jumpToStep: failNextIdx
      });

    } else if (action === "fail") {
      const targetStep = stepIndex !== undefined ? stepIndex : (task.currentStep ?? 0);
      const steps = task.workflowSteps || [];

      const log: ExecutionLog = {
        stepId: steps[targetStep]?.id || `step-${targetStep + 1}`,
        stepName: steps[targetStep]?.name || `步骤${targetStep + 1}`,
        stepType: steps[targetStep]?.type || "execute",
        executedAt: new Date().toISOString(),
        result: "failed",
        notes: body.notes || "执行失败"
      };
      task.executionLog = task.executionLog || [];
      task.executionLog.push(log);
      task.updatedAt = new Date().toISOString();

      tasks[taskIdx] = task;
      if (!writeTasks(tasks)) {
        return NextResponse.json({ error: "保存失败" }, { status: 500 });
      }

      const failAgentId = task.assigneeId || legion?.leaderId;
      addTaskReport("task_failed", task, legion, failAgentId || "system", steps[targetStep]?.name, `❌ 任务失败: ${body.notes || "未知原因"}`);

      return NextResponse.json({
        success: true,
        message: "步骤执行失败",
        task: tasks[taskIdx],
        log,
        reported: true
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    const tasks = readTasks();

    if (taskId) {
      const task = tasks.find((t: Task) => t.id === taskId);
      if (!task) {
        return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    const allLogs = tasks
      .filter((t: Task) => t.executionLog && t.executionLog.length > 0)
      .flatMap((t: Task) => (t.executionLog || []).map((log: ExecutionLog) => ({
        ...log,
        taskId: t.id,
        taskTitle: t.title
      })));

    return NextResponse.json({ logs: allLogs.reverse() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
