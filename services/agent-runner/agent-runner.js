#!/usr/bin/env node
/**
 * Agent Runner Daemon v3
 * 
 * 架构：Runner -> MAIN Agent -> sessions_spawn -> Worker Agent
 * 
 * Runner只负责监控和通知，真正的Agent spawn由MAIN执行
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const DISPATCH_FILE = path.join(OPENCLAW_HOME, 'lobster-dispatch-queue.json');
const INBOX_FILE = path.join(OPENCLAW_HOME, 'lobster-agent-inbox', 'agent-inbox.json');
const TASKS_FILE = path.join(OPENCLAW_HOME, 'lobster-tasks.json');
const REPORT_FILE = path.join(OPENCLAW_HOME, 'lobster-reports', 'report-queue.json');
const NOTIFY_FILE = path.join(OPENCLAW_HOME, 'lobster-agent-notify.json');

[path.dirname(DISPATCH_FILE), path.dirname(INBOX_FILE), path.dirname(TASKS_FILE), path.dirname(REPORT_FILE)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let isRunning = true;

function readDispatchQueue() {
  try {
    if (!fs.existsSync(DISPATCH_FILE)) return [];
    return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf-8'));
  } catch (e) { return []; }
}

function saveDispatchQueue(queue) {
  try {
    fs.writeFileSync(DISPATCH_FILE, JSON.stringify(queue, null, 2));
    return true;
  } catch (e) { return false; }
}

function readTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    const data = fs.readFileSync(TASKS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : (parsed.tasks || []);
  } catch (e) { return []; }
}

function saveTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch (e) { return false; }
}

function addToInbox(agentId, task, action, stepName) {
  try {
    let inbox = { agents: {} };
    if (fs.existsSync(INBOX_FILE)) inbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf-8'));
    if (!inbox.agents[agentId]) inbox.agents[agentId] = { pendingTasks: [], lastCheck: new Date().toISOString() };
    
    const message = action === 'start'
      ? `🦞 新任务：请开始执行「${task.title}」`
      : action === 'execute'
      ? `⚡ 执行步骤：${stepName || '执行中'} - 「${task.title}」`
      : `📋 任务更新 - 「${task.title}」`;
    
    inbox.agents[agentId].pendingTasks.push({
      taskId: task.id,
      title: task.title,
      message,
      receivedAt: new Date().toISOString(),
      action,
      stepName
    });
    inbox.agents[agentId].lastCheck = new Date().toISOString();
    fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
    return true;
  } catch (e) { return false; }
}

function generateReport(agentId, agentName, taskId, taskTitle, eventType, message) {
  try {
    let reports = { reports: [] };
    if (fs.existsSync(REPORT_FILE)) reports = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
    
    reports.reports.push({
      id: `report-${Date.now()}`,
      agentId, agentName, taskId, taskTitle, eventType, message,
      timestamp: new Date().toISOString()
    });
    if (reports.reports.length > 100) reports.reports = reports.reports.slice(-100);
    fs.writeFileSync(REPORT_FILE, JSON.stringify(reports, null, 2));
    return true;
  } catch (e) { return false; }
}

/**
 * 通知MAIN Agent有新任务 - MAIN会spawn真正的执行Agent
 */
function notifyMainAgent(agentId, task, action, stepName) {
  try {
    let notify = [];
    if (fs.existsSync(NOTIFY_FILE)) notify = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf-8'));
    
    notify.push({
      id: `notify-${Date.now()}`,
      targetAgent: 'main',
      sourceAgent: 'runner',
      taskId: task.id,
      taskTitle: task.title,
      executorAgentId: agentId,
      action: action,
      stepName: stepName,
      message: `🦞 Runner通知：有新任务需要执行\n任务：${task.title}\n执行Agent：${agentId}\n动作：${action}`,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    
    fs.writeFileSync(NOTIFY_FILE, JSON.stringify(notify, null, 2));
    console.log(`📨 已通知MAIN Agent: ${agentId} -> ${task.title}`);
    return true;
  } catch (e) { console.error('通知失败:', e.message); return false; }
}

/**
 * 使用openclaw agent命令发送任务（改进版：直接执行模式）
 * 
 * 改进点：
 * 1. 使用 --local 标志直接执行，避免Gateway路由延迟
 * 2. 使用 execSync 同步执行，确保获取完整结果
 * 3. 过滤插件日志噪声，只保留实际输出
 * 4. 分离 stdout 和 stderr，正确处理错误
 */
function sendTaskToAgent(agentId, task, stepName) {
  return new Promise((resolve) => {
    const message = `🦞 龙虾军团任务！

任务标题：${task.title}
${task.description ? `任务描述：${task.description}` : ''}
${stepName ? `当前步骤：${stepName}` : ''}

请立即执行这个任务，完成后输出执行结果。`;

    // 使用 --local 模式直接执行，通过Gateway的spawn机制运行Agent
    // 这样可以获得完整的执行输出
    const command = `openclaw agent --agent "${agentId}" --message "${message.replace(/"/g, '\\"')}" --timeout 300`;
    
    console.log(`📤 发送任务到Agent: ${agentId}`);
    console.log(`   📋 任务: ${task.title}`);
    
    const startTime = Date.now();
    
    try {
      // 使用 execSync 同步执行，等待完整结果
      const { execSync } = require('child_process');
      const result = execSync(command, { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 300000, // 5分钟超时
        stdio: ['pipe', 'pipe', 'pipe'] // 捕获 stdout 和 stderr
      });
      
      const duration = Date.now() - startTime;
      
      // 过滤掉插件日志噪声
      const output = filterPluginNoise(result);
      
      console.log(`✅ Agent任务执行完成 [${duration}ms]`);
      console.log(`   📊 输出长度: ${output.length} 字符`);
      
      resolve({ 
        success: true, 
        output, 
        duration,
        rawOutput: result
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 错误情况下也尝试获取输出
      let output = '';
      if (error.stdout) output += error.stdout;
      if (error.stderr) output += error.stderr;
      if (error.message) output += `\n错误: ${error.message}`;
      
      console.log(`⚠️ Agent执行完成但有错误 [${duration}ms]: ${error.message}`);
      
      resolve({ 
        success: false, 
        output: filterPluginNoise(output),
        error: error.message,
        duration,
        hasError: true
      });
    }
  });
}

/**
 * 过滤插件注册日志等噪声，只保留实际Agent输出
 */
function filterPluginNoise(output) {
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
      // 如果是🦞开头，保留（这是Agent的输出标记）
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

async function processDispatch(item) {
  const { id, agentId, taskId, action, stepName } = item;
  
  console.log(`\n📋 处理: ${id}`);
  console.log(`   🤖 执行Agent: ${agentId}`);
  console.log(`   📌 任务: ${taskId}`);
  console.log(`   ⚡ 动作: ${action}`);

  const tasks = readTasks();
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    console.error(`❌ 任务不存在: ${taskId}`);
    const queue = readDispatchQueue();
    const qi = queue.find(q => q.id === id);
    if (qi) { qi.status = 'failed'; qi.error = '任务不存在'; qi.completedAt = new Date().toISOString(); saveDispatchQueue(queue); }
    return;
  }

  // 添加到收件箱
  addToInbox(agentId, task, action, stepName);
  
  // 生成开始汇报
  generateReport(agentId, agentId, taskId, task.title, 'task_started', `🚀 Agent[${agentId}]开始执行任务`);
  
  // 关键：通过CLI发送任务给Agent并获取完整结果
  const result = await sendTaskToAgent(agentId, task, stepName);

  // 更新分发状态 - 保存完整结果
  const queue = readDispatchQueue();
  const qi = queue.find(q => q.id === id);
  if (qi) {
    qi.status = 'completed';
    qi.result = result.hasError ? '执行完成但有警告' : '执行完成';
    qi.agentOutput = result.output; // 保存Agent实际输出
    qi.error = result.error || null;
    qi.duration = result.duration;
    qi.completedAt = new Date().toISOString();
    saveDispatchQueue(queue);
  }

  // 生成包含输出的汇报
  const outputPreview = result.output 
    ? (result.output.length > 200 ? result.output.substring(0, 200) + '...' : result.output)
    : '无输出';
  generateReport(
    agentId, 
    agentId, 
    taskId, 
    task.title, 
    result.hasError ? 'task_failed' : 'task_completed', 
    result.hasError 
      ? `⚠️ 执行完成但有问题: ${result.error}`
      : `✅ 执行完成\n输出预览: ${outputPreview}`
  );

  // 更新任务状态 - 保存Agent输出到任务记录
  const tasks2 = readTasks();
  const idx = tasks2.findIndex(t => t.id === taskId);
  if (idx >= 0) {
    tasks2[idx].status = result.hasError ? 'in_progress' : 'done';
    tasks2[idx].updatedAt = new Date().toISOString();
    tasks2[idx].executionResult = result.output; // 关键：保存Agent输出
    tasks2[idx].executionError = result.error || null;
    saveTasks(tasks2);
  }

  // 通知MAIN Agent（用于监控和协调）
  notifyMainAgent(agentId, task, action, stepName);
  
  console.log(`✅ 处理完成: ${id}`);
  if (result.output) {
    console.log(`   📊 Agent输出长度: ${result.output.length} 字符`);
  }
}

async function mainLoop() {
  console.log('═══════════════════════════════════════');
  console.log('   🦞 Agent Runner v3 启动');
  console.log('═══════════════════════════════════════');
  console.log(`📁 分发队列: ${DISPATCH_FILE}`);
  console.log(`📬 收件箱: ${INBOX_FILE}`);
  console.log(`📊 任务文件: ${TASKS_FILE}`);
  console.log(`📨 通知文件: ${NOTIFY_FILE}`);
  console.log('═══════════════════════════════════════');
  
  while (isRunning) {
    try {
      const queue = readDispatchQueue();
      const pending = queue.filter(item => item.status === 'pending');
      
      if (pending.length > 0) {
        console.log(`\n📦 发现 ${pending.length} 个待处理任务`);
        for (const item of pending) {
          await processDispatch(item);
        }
      }
    } catch (e) {
      console.error('处理循环异常:', e.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('🛑 Agent Runner 已停止');
}

function stop() {
  console.log('🛑 收到停止信号...');
  isRunning = false;
}

process.on('SIGINT', () => { console.log('\n🔴 SIGINT'); stop(); });
process.on('SIGTERM', () => { console.log('\n🔴 SIGTERM'); stop(); });
process.on('uncaughtException', (e) => { console.error('❌ 异常:', e); isRunning = false; });

console.log('🚀 启动Agent Runner...');
mainLoop().catch(e => { console.error('❌ 启动失败:', e); process.exit(1); });
