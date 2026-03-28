/**
 * 通过OpenClaw API Spawn Agent
 * 使用 sessions_spawn 机制真正启动subagent
 */

const http = require('http');

const OPENCLAW_HOST = process.env.OPENCLAW_HOST || 'localhost';
const OPENCLAW_PORT = process.env.OPENCLAW_PORT || '18792';

/**
 * 调用OpenClaw Gateway API spawn subagent
 */
async function spawnAgent(agentId, task, stepName) {
  return new Promise((resolve, reject) => {
    const message = `🦞 龙虾军团任务！

任务标题：${task.title}
${task.description ? `任务描述：${task.description}` : ''}
${stepName ? `当前步骤：${stepName}` : ''}

请立即执行任务，完成后汇报结果。`;

    // 构建spawn请求
    const postData = JSON.stringify({
      agentId: agentId,
      task: `【龙虾军团】${task.title}`,
      message: message,
      timeoutSeconds: 300
    });

    const options = {
      hostname: OPENCLAW_HOST,
      port: OPENCLAW_PORT,
      path: '/api/sessions/spawn',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`🚀 尝试启动Agent: ${agentId}`);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📨 API响应 [${res.statusCode}]: ${data.substring(0, 200)}`);
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const result = JSON.parse(data);
            resolve({ success: true, sessionKey: result.sessionKey, output: data });
          } catch (e) {
            resolve({ success: true, output: data });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ API请求失败: ${e.message}`);
      resolve({ success: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = { spawnAgent };
