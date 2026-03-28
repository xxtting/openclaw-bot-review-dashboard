/**
 * 公开的Agent配置接口
 * 
 * 提供给龙虾军团导入功能使用
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
  legionId?: string;
}

function readAgentsFromDisk(): Agent[] {
  const agents: Agent[] = [];
  
  // 方法1：从 lobster-legions.json 读取 agents
  const legionsFile = path.join(OPENCLAW_HOME, "lobster-legions.json");
  if (fs.existsSync(legionsFile)) {
    try {
      const legionsData = JSON.parse(fs.readFileSync(legionsFile, "utf-8"));
      if (legionsData.agents && Array.isArray(legionsData.agents)) {
        for (const agent of legionsData.agents) {
          if (!agents.find(a => a.id === agent.id)) {
            agents.push({
              id: agent.id,
              name: agent.name || agent.id,
              emoji: agent.emoji || "🤖",
              role: agent.role || "成员",
              status: "offline",
              legionId: agent.legionId || ""
            });
          }
        }
      }
    } catch (e) {
      console.error("读取lobster-legions.json agents失败:", e);
    }
  }
  
  // 方法2：从 /root/.openclaw/agents/ 目录扫描
  const agentsDir = path.join(OPENCLAW_HOME, "agents");
  if (fs.existsSync(agentsDir)) {
    try {
      const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agentId = entry.name;
          // 跳过已存在的agent
          if (agents.find(a => a.id === agentId)) continue;
          
          const agentDir = path.join(agentsDir, agentId);
          const agentJsonFile = path.join(agentDir, "agent.json");
          
          if (fs.existsSync(agentJsonFile)) {
            try {
              const agentData = JSON.parse(fs.readFileSync(agentJsonFile, "utf-8"));
              agents.push({
                id: agentId,
                name: agentData.name || agentData.displayName || agentId,
                emoji: agentData.emoji || "🤖",
                role: agentData.role || "成员",
                status: "offline",
                legionId: agentData.legionId || ""
              });
            } catch (e) {
              // 忽略单个agent读取失败
            }
          }
        }
      }
    } catch (e) {
      console.error("扫描agents目录失败:", e);
    }
  }

  return agents;
}

// GET /api/agents/config - 获取所有Agent配置
export async function GET() {
  try {
    const agents = readAgentsFromDisk();

    return NextResponse.json({
      success: true,
      agents,
      count: agents.length
    });

  } catch (e: any) {
    return NextResponse.json({ 
      success: false, 
      error: e.message 
    }, { status: 500 });
  }
}
