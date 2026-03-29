/**
 * 龙虾军团 - Agent Runner Daemon
 * 
 * 核心职责：
 * 1. 监听 dispatch 队列，等待任务分配
 * 2. 使用 child_process.spawn 异步执行 openclaw agent
 * 3. 捕获 stdout 写入输出文件
 * 4. 更新任务状态和产出记录
 * 5. 支持多 Agent 并发执行
 * 
 * 运行方式：
 *   npx ts-node scripts/agent-runner-daemon.ts
 *   或: node scripts/agent-runner-daemon.js (编译后)
 */

import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import os from "os";

const HOME = os.homedir();
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(HOME, ".openclaw");

// 配置路径
const DISPATCH_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-dispatch-queue.json");
const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const OUTPUTS_DIR = path.join(OPENCLAW_HOME, "lobster-agent-outputs");
const OUTPUT_INDEX_FILE = path.join(OPENCLAW_HOME, "lobster-outputs", "output-index.json");
const LEGIONS_FILE = path.join(OPENCLAW_HOME, "lobster-legions.json");
const REPORT_QUEUE_FILE = path.join(OPENCLAW_HOME, "lobster-reports", "main-report-queue.json");

// 配置
const POLL_INTERVAL_MS = 3000;        // 轮询间隔
const AGENT_TIMEOUT_MS = 300000;       // 5分钟超时
const MAX_CONCURRENT = 3;              // 最大并发 Agent 数
const MIN_OUTPUT_LENGTH = 50;          // 最小有效产出长度

// 状态
let runningProcesses: Map<string, ChildProcess> = new Map();
let isShuttingDown = false;

// ==================== 日志 ====================

function log(level: "INFO" | "WARN" | "ERROR", msg: string, data?: any) {
  const ts = new Date().toISOString();
  const prefix = level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "ℹ️";
  if (data) {
    console.log(`${ts} ${prefix} [${level}] ${msg}`, data);
  } else {
    console.log(`${ts} ${prefix} [${level}] ${msg}`);
  }
}

// ==================== 文件读写 ====================

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: any): boolean {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    log("ERROR", `写入文件失败: ${file}`, e);
    return false;
  }
}

// ==================== 产出验证 ====================

function validateOutput(content: string): { valid: boolean; message: string; details: any } {
  if (!content || content.trim().length === 0) {
    return { valid: false, message: "产出为空", details: { length: 0 } };
  }
  const trimmed = content.trim();
  const length = Buffer.byteLength(trimmed, "utf-8");
  const lines = trimmed.split("\n").length;
  
  // 🔥 检测错误模式（Agent 执行失败）
  const errorPatterns = [
    /Unknown agent id/i,
    /Gateway agent failed/i,
    /agent.*not found/i,
    /not a valid agent/i,
    /Error:.*agent/i,
    /Authentication failed/i,
    /Unauthorized/i,
  ];
  for (const p of errorPatterns) {
    if (p.test(trimmed)) {
      return { valid: false, message: `Agent执行错误：检测到错误信息（${length}字节）`, details: { length, lines } };
    }
  }
  
  const lowQualityPatterns = [
    /^收到$/i, /^完成$/i, /^好的$/i, /^OK$/i, /^done$/i,
    /^已执行$/i, /^执行完成$/i, /^任务完成$/i
  ];
  for (const p of lowQualityPatterns) {
    if (p.test(trimmed)) {
      return { valid: false, message: "疑似敷衍内容", details: { length, lines } };
    }
  }
  if (length < MIN_OUTPUT_LENGTH) {
    return { valid: false, message: `内容过短（${length}<${MIN_OUTPUT_LENGTH}字节）`, details: { length, lines } };
  }
  return { valid: true, message: `验证通过（${length}字节，${lines}行）`, details: { length, lines } };
}

// ==================== 产出存储 ====================

interface StepOutput {
  id: string;
  taskId: string;
  stepIndex: number;
  stepId: string;
  stepName: string;
  agentId: string;
  content: string;
  outputPath?: string;
  validationStatus: "pending" | "valid" | "invalid" | "empty";
  validationMessage?: string;
  reviewStatus: "pending" | "approved" | "rejected" | "needs_revision";
  createdAt: string;
  updatedAt: string;
}

interface OutputIndex {
  outputs: Record<string, StepOutput>;
  lastId: number;
}

function storeOutput(
  taskId: string,
  stepIndex: number,
  stepId: string,
  stepName: string,
  agentId: string,
  content: string,
  outputPath?: string,
  durationMs?: number
): StepOutput {
  const index: OutputIndex = readJSON(OUTPUT_INDEX_FILE, { outputs: {}, lastId: 0 });
  const validation = validateOutput(content);
  const now = new Date().toISOString();
  
  // 查找是否已存在
  const existingId = Object.keys(index.outputs).find(
    id => index.outputs[id].taskId === taskId && index.outputs[id].stepIndex === stepIndex
  );
  
  const output: StepOutput = {
    id: existingId || `out-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taskId,
    stepIndex,
    stepId,
    stepName,
    agentId,
    content,
    outputPath,
    validationStatus: validation.valid ? "valid" : (content ? "invalid" : "empty"),
    validationMessage: validation.message,
    reviewStatus: "pending",
    createdAt: existingId ? index.outputs[existingId].createdAt : now,
    updatedAt: now
  };
  
  index.outputs[output.id] = output;
  index.lastId++;
  writeJSON(OUTPUT_INDEX_FILE, index);
  
  log("INFO", `产出已存储: ${output.id} (验证: ${validation.valid ? "通过" : "失败"})`);
  return output;
}

// ==================== 任务状态更新 ====================

function updateTaskLog(taskId: string, logEntry: any): boolean {
  const tasks: any[] = readJSON(TASKS_FILE, []);
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return false;
  
  tasks[idx].executionLog = tasks[idx].executionLog || [];
  tasks[idx].executionLog.push({
    ...logEntry,
    executedAt: new Date().toISOString()
  });
  tasks[idx].updatedAt = new Date().toISOString();
  tasks[idx].executedAt = new Date().toISOString();
  
  return writeJSON(TASKS_FILE, tasks);
}

function reportToMain(taskId: string, status: "done" | "failed", result: string, outputs?: StepOutput[]) {
  try {
    let data: any = readJSON(REPORT_QUEUE_FILE, { reports: [], lastId: 0 });
    const tasks: any[] = readJSON(TASKS_FILE, []);
    const task = tasks.find(t => t.id === taskId);
    const legions: any = readJSON(LEGIONS_FILE, { legions: [], agents: [] });
    const legion = legions.legions?.find((l: any) => l.id === task?.legionId);
    
    data.reports.push({
      id: ++data.lastId,
      taskId,
      legionId: task?.legionId || "",
      legionName: legion?.name || "",
      taskTitle: task?.title || taskId,
      status,
      result,
      agentOutputs: outputs,
      fromAgent: task?.assigneeId || legion?.leaderId,
      createdAt: new Date().toISOString(),
      sentToMain: false
    });
    
    writeJSON(REPORT_QUEUE_FILE, data);
    log("INFO", `已汇报给MAIN: [${status}] ${result}`);
  } catch (e) {
    log("ERROR", "汇报MAIN失败", e);
  }
}

// ==================== 核心：执行 Agent ====================

function executeAgentTask(dispatchItem: any): Promise<{ success: boolean; output: string; outputPath?: string; error?: string; durationMs: number }> {
  return new Promise((resolve) => {
    const { agentId, taskId, taskTitle, stepName } = dispatchItem;
    const stepIndex = dispatchItem.stepIndex ?? 0;
    const taskDescription = dispatchItem.taskDescription || dispatchItem.description || "";
    
    ensureDir(OUTPUTS_DIR);
    const outputPath = path.join(OUTPUTS_DIR, `${taskId}-step${stepIndex}-${Date.now()}.txt`);
    
    const message = `🦞【龙虾军团任务】

任务标题：${taskTitle}
${taskDescription ? `\n任务描述：${taskDescription}` : ""}
步骤：${stepName || "执行中"}

🔥 请务必完成以下工作：

1. 认真理解任务要求
2. 实质性执行任务（编写代码、分析数据、创作内容等）
3. 将完整执行结果写入输出文件：${outputPath}
4. 输出内容必须包含：
   - 具体做了什么
   - 实际产出内容（代码/分析结果/创作内容）
   - 遇到的问题及解决方案
   - 是否完成

⚠️ 禁止仅回复"收到"、"完成"等敷衍内容，必须输出实质性工作成果！`;

    const safeMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const args = [
      "agent",
      "--agent", agentId,
      "--message", safeMessage,
      "--timeout", "300",
      "--json"
    ];
    
    // 🎯 检查是否使用本地模式（BOSS要求使用OpenClaw默认API）
    if (dispatchItem.useLocal === true || dispatchItem.local === true) {
      args.push("--local");
    }
    
    log("INFO", `🚀 启动Agent: ${agentId} for 任务: ${taskTitle}`);
    const startTime = Date.now();
    
    // 设置环境变量，确保Agent能够正常执行
    const agentEnv = {
      ...process.env,
      OPENCLAW_HOME,
      MINIMAX_API_KEY: "sk-cp-3q6utq6_cqB79ODB-rNnKtJI7yjz9PZF7PVslipJmgNTeUXVe_XkmHZnOlM9lNthlkK7cVs1tc-eMBi3_4SsIOUvRHSeXaQi98APIGcHitVeNf5DxvtTZkI"
    };

    const proc = spawn("openclaw", args, {
      cwd: OPENCLAW_HOME,
      stdio: ["pipe", "pipe", "pipe"],
      env: agentEnv
    });
    
    runningProcesses.set(`${taskId}-${stepIndex}`, proc);
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on("close", (code) => {
      runningProcesses.delete(`${taskId}-${stepIndex}`);
      const durationMs = Date.now() - startTime;
      
      // 合并 stdout + stderr
      let fullOutput = stdout;
      if (stderr && !stderr.includes("Registered ")) {
        fullOutput += "\n" + stderr;
      }
      
      // 尝试读取输出文件
      let fileContent = "";
      if (fs.existsSync(outputPath)) {
        try {
          fileContent = fs.readFileSync(outputPath, "utf-8");
        } catch {}
      }
      
      // 优先使用文件内容
      const finalOutput = (fileContent.trim() || filterOutput(fullOutput)).trim();
      
      if (code === 0 || finalOutput.length > 0) {
        log("INFO", `✅ Agent完成: ${agentId} (${durationMs}ms)`);
        resolve({ success: true, output: finalOutput, outputPath, durationMs });
      } else {
        log("WARN", `⚠️ Agent退出码${code}: ${agentId}`);
        resolve({ success: false, output: finalOutput, error: `Exit code: ${code}`, durationMs });
      }
    });
    
    proc.on("error", (err) => {
      runningProcesses.delete(`${taskId}-${stepIndex}`);
      const durationMs = Date.now() - startTime;
      log("ERROR", `❌ Agent进程错误: ${agentId}`, err.message);
      resolve({ success: false, output: stdout, error: err.message, durationMs });
    });
    
    // 超时控制
    setTimeout(() => {
      if (runningProcesses.has(`${taskId}-${stepIndex}`)) {
        log("WARN", `⏰ Agent超时，强制终止: ${agentId}`);
        proc.kill("SIGTERM");
        runningProcesses.delete(`${taskId}-${stepIndex}`);
        const durationMs = Date.now() - startTime;
        // 仍然尝试读取已写内容
        let fileContent = "";
        if (fs.existsSync(outputPath)) {
          try { fileContent = fs.readFileSync(outputPath, "utf-8"); } catch {}
        }
        const finalOutput = (fileContent.trim() || filterOutput(stdout)).trim();
        resolve({ success: false, output: finalOutput, outputPath, error: "Timeout", durationMs });
      }
    }, AGENT_TIMEOUT_MS);
  });
}

function filterOutput(output: string): string {
  if (!output) return "";
  const lines = output.split("\n");
  const filtered: string[] = [];
  let inReal = false;
  for (const line of lines) {
    if (line.startsWith("[plugins]") || line.includes("Registered ")) continue;
    if (!inReal && (line.trim() === "" || line.startsWith("["))) {
      if (line.startsWith("🦞") || line.startsWith("✅") || line.startsWith("❌")) {
        filtered.push(line); inReal = true;
      }
      continue;
    }
    inReal = true;
    filtered.push(line);
  }
  return filtered.join("\n").trim();
}

// ==================== 主循环 ====================

async function processDispatchQueue() {
  const queue: any[] = readJSON(DISPATCH_QUEUE_FILE, []);
  
  // 找 pending 状态且未在执行的任务
  const pending = queue.filter(
    item => item.status === "pending" && !runningProcesses.has(`${item.taskId}-${item.stepIndex}`)
  );
  
  if (pending.length === 0) return;
  
  // 按优先级排序
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  pending.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
  
  // 如果并发已满，跳过
  if (runningProcesses.size >= MAX_CONCURRENT) {
    log("INFO", `并发已达上限(${runningProcesses.size}/${MAX_CONCURRENT})，等待中...`);
    return;
  }
  
  const item = pending[0];
  
  // 标记为执行中
  item.status = "processing";
  item.startedAt = new Date().toISOString();
  const queueIdx = queue.findIndex(q => q.id === item.id);
  if (queueIdx !== -1) queue[queueIdx] = item;
  writeJSON(DISPATCH_QUEUE_FILE, queue);
  
  log("INFO", `📥 开始处理调度项: ${item.id} - Agent: ${item.agentId}`);
  
  try {
    const result = await executeAgentTask(item);
    
    // 存储产出
    const output = storeOutput(
      item.taskId,
      item.stepIndex ?? 0,
      `step-${(item.stepIndex ?? 0) + 1}`,
      item.stepName || "执行",
      item.agentId,
      result.output,
      result.outputPath,
      result.durationMs
    );
    
    // 更新任务日志
    updateTaskLog(item.taskId, {
      stepId: `step-${(item.stepIndex ?? 0) + 1}`,
      stepName: item.stepName || "执行",
      stepType: "execute",
      executedBy: item.agentId,
      result: output.validationStatus === "valid" ? "success" : "failed",
      notes: output.validationMessage || (result.success ? "执行完成" : result.error),
      agentOutput: result.output,
      outputId: output.id
    });
    
    // 标记完成
    if (queueIdx !== -1) {
      queue[queueIdx].status = "completed";
      queue[queueIdx].completedAt = new Date().toISOString();
      queue[queueIdx].result = result.output.substring(0, 500);
      queue[queueIdx].outputId = output.id;
      writeJSON(DISPATCH_QUEUE_FILE, queue);
    }
    
    log("INFO", `✅ 调度项完成: ${item.id}, 产出验证: ${output.validationStatus}`);
    
  } catch (e: any) {
    log("ERROR", `❌ 处理调度项失败: ${item.id}`, e.message);
    if (queueIdx !== -1) {
      queue[queueIdx].status = "failed";
      queue[queueIdx].error = e.message;
      writeJSON(DISPATCH_QUEUE_FILE, queue);
    }
  }
}

// ==================== 启动 ====================

function startup() {
  ensureDir(OUTPUTS_DIR);
  ensureDir(path.join(OPENCLAW_HOME, "lobster-outputs"));
  
  log("INFO", "🦞 龙虾军团 Agent Runner Daemon 启动");
  log("INFO", `OPENCLAW_HOME: ${OPENCLAW_HOME}`);
  log("INFO", `轮询间隔: ${POLL_INTERVAL_MS}ms`);
  log("INFO", `最大并发: ${MAX_CONCURRENT}`);
  
  // 注册优雅关闭
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  
  // 启动轮询
  const interval = setInterval(() => {
    if (isShuttingDown) {
      clearInterval(interval);
      return;
    }
    processDispatchQueue().catch(e => log("ERROR", "轮询异常", e));
  }, POLL_INTERVAL_MS);
  
  log("INFO", "✅ Daemon 运行中，按 Ctrl+C 关闭");
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log("WARN", "🛑 Daemon 关闭中...");
  
  // 终止所有运行中的进程
  for (const [key, proc] of runningProcesses) {
    log("WARN", `终止进程: ${key}`);
    proc.kill("SIGTERM");
  }
  
  setTimeout(() => {
    log("INFO", "👋 Daemon 已关闭");
    process.exit(0);
  }, 3000);
}

// CLI 入口
if (require.main === module) {
  startup();
}

export { executeAgentTask, processDispatchQueue, startup, shutdown };
