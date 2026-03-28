/**
 * 龙虾军团 - Agent 执行引擎核心
 * 
 * 职责：
 * 1. 从 SOUL.md 加载 Agent 定义
 * 2. 使用 OpenClaw sessions_yield 机制启动 Agent
 * 3. 管理 Agent 任务队列
 * 4. 收集 Agent 执行结果并汇报
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "/root", ".openclaw");
const AGENTS_DIR = path.join(OPENCLAW_HOME, "workspace/agents");
const INBOX_DIR = path.join(OPENCLAW_HOME, "lobster-agent-inbox");
const TASKS_FILE = path.join(OPENCLAW_HOME, "lobster-tasks.json");
const REPORTS_FILE = path.join(OPENCLAW_HOME, "lobster-reports.json");

export interface Agent {
  id: string;
  name: string;
  role: string;
  team: string;
  soulPath: string;
  inboxPath: string;
  status: "idle" | "busy" | "offline";
}

export interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  description: string;
  payload: any;
  status: "pending" | "running" | "done" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
}

export interface AgentReport {
  id: string;
  agentId: string;
  agentName: string;
  taskId: string;
  taskTitle: string;
  type: "task_started" | "task_completed" | "task_failed" | "heartbeat";
  message: string;
  data?: any;
  timestamp: string;
  sentToBoss: boolean;
}

/**
 * 加载所有注册的 Agent
 */
export function loadAgents(): Agent[] {
  const agents: Agent[] = [];
  
  if (!fs.existsSync(AGENTS_DIR)) {
    console.error("❌ Agents目录不存在:", AGENTS_DIR);
    return agents;
  }

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const soulPath = path.join(AGENTS_DIR, entry.name, "SOUL.md");
      const inboxPath = path.join(INBOX_DIR, `${entry.name}-inbox.json`);
      
      if (fs.existsSync(soulPath)) {
        const soulContent = fs.readFileSync(soulPath, "utf-8");
        const idMatch = soulContent.match(/\*\*Agent ID\*\*:\s*(.+)/);
        const nameMatch = soulContent.match(/\*\*角色名称\*\*:\s*(.+)/);
        const teamMatch = soulContent.match(/\*\*团队\*\*:\s*(.+)/);
        
        agents.push({
          id: idMatch ? idMatch[1].trim() : entry.name,
          name: nameMatch ? nameMatch[1].trim() : entry.name,
          role: entry.name,
          team: teamMatch ? teamMatch[1].trim() : "未分类",
          soulPath,
          inboxPath,
          status: "idle"
        });
      }
    }
  }
  
  console.log(`✅ 已加载 ${agents.length} 个 Agent`);
  return agents;
}

/**
 * 获取某个团队的所有 Agent
 */
export function getAgentsByTeam(teamName: string): Agent[] {
  const agents = loadAgents();
  return agents.filter(a => a.team.includes(teamName));
}

/**
 * 为 Agent 创建任务
 */
export function createAgentTask(agentId: string, title: string, description: string, payload: any): AgentTask {
  const task: AgentTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    agentId,
    title,
    description,
    payload,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  
  // 保存到任务文件
  const tasks = readTasks();
  tasks.push(task);
  writeTasks(tasks);
  
  // 同时写入 Agent 收件箱
  writeToAgentInbox(agentId, task);
  
  console.log(`✅ 任务已创建: ${task.id} -> ${agentId}`);
  return task;
}

/**
 * 写入 Agent 收件箱
 */
function writeToAgentInbox(agentId: string, task: AgentTask): void {
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }
  
  const inboxFile = path.join(INBOX_DIR, `${agentId}-inbox.json`);
  let inbox: AgentTask[] = [];
  
  if (fs.existsSync(inboxFile)) {
    try {
      inbox = JSON.parse(fs.readFileSync(inboxFile, "utf-8"));
    } catch (e) {
      inbox = [];
    }
  }
  
  inbox.push(task);
  fs.writeFileSync(inboxFile, JSON.stringify(inbox, null, 2));
}

/**
 * 读取所有任务
 */
function readTasks(): AgentTask[] {
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * 写入任务文件
 */
function writeTasks(tasks: AgentTask[]): void {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 更新任务状态
 */
export function updateTaskStatus(taskId: string, status: AgentTask["status"], result?: any): AgentTask | null {
  const tasks = readTasks();
  const taskIdx = tasks.findIndex(t => t.id === taskId);
  
  if (taskIdx === -1) {
    console.error("❌ 任务不存在:", taskId);
    return null;
  }
  
  tasks[taskIdx].status = status;
  
  if (status === "running") {
    tasks[taskIdx].startedAt = new Date().toISOString();
  } else if (status === "done" || status === "failed") {
    tasks[taskIdx].completedAt = new Date().toISOString();
    tasks[taskIdx].result = result;
  }
  
  writeTasks(tasks);
  return tasks[taskIdx];
}

/**
 * 生成 Agent 汇报
 */
export function generateReport(
  agentId: string,
  agentName: string,
  taskId: string,
  taskTitle: string,
  type: AgentReport["type"],
  message: string,
  data?: any
): AgentReport {
  const report: AgentReport = {
    id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    agentId,
    agentName,
    taskId,
    taskTitle,
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
    sentToBoss: false
  };
  
  // 保存汇报
  const reports = readReports();
  reports.push(report);
  writeReports(reports);
  
  console.log(`📝 汇报已生成: ${type} - ${message}`);
  return report;
}

/**
 * 读取汇报
 */
function readReports(): AgentReport[] {
  if (!fs.existsSync(REPORTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REPORTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * 写入汇报
 */
function writeReports(reports: AgentReport[]): void {
  const dir = path.dirname(REPORTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
}

/**
 * 获取未发送的汇报
 */
export function getUnsentReports(): AgentReport[] {
  const reports = readReports();
  return reports.filter(r => !r.sentToBoss);
}

/**
 * 标记汇报已发送
 */
export function markReportsSent(reportIds: string[]): void {
  const reports = readReports();
  for (const report of reports) {
    if (reportIds.includes(report.id)) {
      report.sentToBoss = true;
    }
  }
  writeReports(reports);
}

/**
 * 执行 Agent（通过 OpenClaw CLI）
 * 这是核心机制：调用 openclaw agent invoke 来执行任务
 */
export async function executeAgent(agentId: string, task: AgentTask): Promise<any> {
  console.log(`🚀 开始执行 Agent: ${agentId}`);
  
  // 更新任务状态
  updateTaskStatus(task.id, "running");
  
  // 生成开始汇报
  const agent = loadAgents().find(a => a.id === agentId);
  if (agent) {
    generateReport(
      agentId,
      agent.name,
      task.id,
      task.title,
      "task_started",
      `🚀 ${agent.name} 开始执行任务`
    );
  }
  
  // 构建 Agent 提示词
  const agentPrompt = buildAgentPrompt(agentId, task);
  
  // 调用 OpenClaw 执行 Agent
  // 使用正确的CLI语法: openclaw agent --agent <id> --message <text> --local
  try {
    const result = execSync(
      `openclaw agent --agent "${agentId}" --message "${agentPrompt.replace(/"/g, '\\"')}" --local`,
      { 
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000 // 5分钟超时
      }
    );
    
    console.log(`✅ Agent 执行完成: ${agentId}`);
    updateTaskStatus(task.id, "done", { output: result });
    
    if (agent) {
      generateReport(
        agentId,
        agent.name,
        task.id,
        task.title,
        "task_completed",
        `✅ 任务已完成`
      );
    }
    
    return { success: true, output: result };
  } catch (error: any) {
    console.error(`❌ Agent 执行失败: ${agentId}`, error.message);
    updateTaskStatus(task.id, "failed", { error: error.message });
    
    if (agent) {
      generateReport(
        agentId,
        agent.name,
        task.id,
        task.title,
        "task_failed",
        `❌ 执行失败: ${error.message}`
      );
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * 构建 Agent 执行提示词
 */
function buildAgentPrompt(agentId: string, task: AgentTask): string {
  return `
你是 ${agentId}，请执行以下任务：

任务标题：${task.title}
任务描述：${task.description}

任务详情：
${JSON.stringify(task.payload, null, 2)}

请完成以上任务，并将你的执行结果输出。
完成时要说明：
1. 你做了什么
2. 输出是什么
3. 是否遇到问题
`.trim();
}

// CLI 入口
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === "list-agents") {
    const agents = loadAgents();
    console.log("\n📋 注册的 Agent 列表：");
    agents.forEach(a => {
      console.log(`  - ${a.id} (${a.name}) - ${a.team}`);
    });
  } else if (command === "execute") {
    const agentId = process.argv[3];
    const taskTitle = process.argv[4] || "测试任务";
    const taskDesc = process.argv[5] || "这是一个测试任务";
    
    if (!agentId) {
      console.error("❌ 请指定 Agent ID");
      process.exit(1);
    }
    
    const task = createAgentTask(agentId, taskTitle, taskDesc, {});
    executeAgent(agentId, task);
  } else if (command === "test") {
    console.log("🧪 测试 Agent 执行引擎...");
    const agents = loadAgents();
    console.log(`\n找到 ${agents.length} 个 Agent`);
    
    if (agents.length > 0) {
      const firstAgent = agents[0];
      console.log(`\n测试 Agent: ${firstAgent.id}`);
      
      const task = createAgentTask(
        firstAgent.id,
        "引擎测试任务",
        "这是一个测试任务，用于验证Agent执行引擎是否正常工作",
        { test: true }
      );
      
      console.log("\n任务已创建，等待执行...");
    }
  } else {
    console.log(`
🦞 龙虾军团 Agent 执行引擎

用法：
  npx ts-node agent-engine.ts list-agents   # 列出所有 Agent
  npx ts-node agent-engine.ts execute <agentId> [title] [desc]  # 执行 Agent
  npx ts-node agent-engine.ts test          # 测试引擎

示例：
  npx ts-node agent-engine.ts execute moxiang-planner "策划任务" "请策划一篇公众号文章"
    `);
  }
}
