"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface Legion {
  id: string;
  name: string;
  emoji: string;
  leaderId: string;
  memberIds: string[];
  status: "idle" | "busy" | "completed";
  color: string;
  workflowSteps?: { id: string; name: string; type: string; assigneeId?: string; conditionType?: "none" | "pass" | "fail"; failNext?: number | null }[];
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: "online" | "busy" | "offline";
  legionId?: string;
  parentId?: string;
  childIds: string[];
  currentTask?: string;
  taskQueue: string[];
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
  createdAt: string;
  currentStep?: number;
  workflowSteps?: { id: string; name: string; type: string; assigneeId?: string; conditionType?: "none" | "pass" | "fail"; failNext?: number | null }[];
  executionLog?: { stepId: string; stepName: string; stepType: string; executedAt: string; result: string; notes?: string }[];
  startedAt?: string;
  completedAt?: string;
}

interface ProjectStats {
  projectName: string;
  progress: number;
  legions: number;
  members: number;
  tasks: number;
  doneTasks: number;
}

interface DispatchTask {
  id: string;
  taskId: string;
  title: string;
  legionId: string;
  legionName: string;
  priority: string;
  status: string;
  createdAt: string;
  message?: string;
}

const STATUS_COLORS = {
  online: "#4ade80",
  busy: "#fbbf24",
  offline: "#64748b",
};

const LEGION_COLORS = [
  "#00d4aa", "#a855f7", "#f97316", "#3b82f6",
  "#ec4899", "#14b8a6", "#eab308", "#6366f1",
];

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const statusColor = STATUS_COLORS[agent.status];
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition-all cursor-pointer min-w-[80px] hover:scale-105 group"
      title={`${agent.name} (${agent.role})`}
    >
      <div className="relative">
        <span className="text-2xl">{agent.emoji}</span>
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--card)]"
          style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
        />
      </div>
      <span className="text-xs font-medium text-center truncate w-full max-w-[72px]">{agent.name}</span>
      <span className="text-[10px] text-[var(--text-muted)] truncate w-full text-center">{agent.role}</span>
    </button>
  );
}

function LegionPanel({
  legion,
  agents,
  tasks,
  color,
  onAgentClick,
  onAddMember,
  onRemoveMember,
  onDeleteLegion,
  onEditWorkflow,
  onDeleteTask,
}: {
  legion: Legion;
  agents: Agent[];
  tasks: Task[];
  color: string;
  onAgentClick: (agent: Agent) => void;
  onAddMember: (legionId: string) => void;
  onRemoveMember: (legionId: string, agentId: string) => void;
  onDeleteLegion: (legionId: string) => void;
  onEditWorkflow: (legion: Legion) => void;
  onDeleteTask: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const members = agents.filter((a) => legion.memberIds.includes(a.id));
  const legionTasks = tasks.filter((t) => t.legionId === legion.id);
  const busyCount = members.filter((m) => m.status === "busy").length;
  const onlineCount = members.filter((m) => m.status === "online").length;

  const statusBadge = legion.status === "busy"
    ? "🟡 忙碌"
    : legion.status === "completed"
    ? "✅ 完成"
    : "⏸️ 空闲";

  return (
    <div className="rounded-xl border-2 bg-[var(--card)] overflow-hidden" style={{ borderColor: `${color}40` }}>
      {/* 军团头部 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: `${color}15` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{legion.emoji}</span>
          <div>
            <h3 className="font-bold text-sm" style={{ color }}>{legion.name}</h3>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{members.length}人</span>
              <span>🟢{onlineCount}</span>
              <span>🟡{busyCount}</span>
              <span className="ml-1">{statusBadge}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEditWorkflow(legion); }}
            className="text-[var(--text-muted)] text-xs px-2 py-1 rounded hover:bg-blue-500/20 hover:text-blue-400 transition cursor-pointer"
            title="编辑工作流"
          >
            ⚙️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteLegion(legion.id); }}
            className="text-[var(--text-muted)] text-xs px-2 py-1 rounded hover:bg-red-500/20 hover:text-red-400 transition cursor-pointer"
            title="删除军团"
          >
            🗑️
          </button>
          <button className="text-[var(--text-muted)] text-xs px-2 py-1 rounded hover:bg-white/10">
            {expanded ? "▲ 收起" : "▼ 展开"}
          </button>
        </div>
      </div>

      {/* 成员网格 */}
      {expanded && (
        <div className="p-3">
          {/* 负责人 */}
          {legion.leaderId && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 font-bold">🎖️ 负责人</p>
              {(() => {
                const leader = agents.find((a) => a.id === legion.leaderId);
                return leader ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10">
                    <span className="text-xl">👑</span>
                    <button onClick={() => onAgentClick(leader)} className="text-sm font-medium text-[var(--accent)] hover:underline cursor-pointer">
                      {leader.name}
                    </button>
                    <span className="text-xs text-[var(--text-muted)] ml-auto">{leader.role}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* 成员 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">🛡️ 成员 ({members.length})</p>
              <button
                onClick={() => onAddMember(legion.id)}
                className="text-xs px-2 py-0.5 rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition cursor-pointer"
              >
                + 增加成员
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((agent) => (
                <div key={agent.id} className="relative group">
                  <AgentCard agent={agent} onClick={() => onAgentClick(agent)} />
                  {agent.id !== legion.leaderId && (
                    <button
                      onClick={() => onRemoveMember(legion.id, agent.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      title="移除成员"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {members.length === 0 && (
                <button
                  onClick={() => onAddMember(legion.id)}
                  className="text-xs text-[var(--text-muted)] italic hover:text-[var(--accent)] transition cursor-pointer py-2"
                >
                  + 添加成员
                </button>
              )}
            </div>
          </div>

          {/* 军团任务 */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 font-bold">📋 任务</p>
            <div className="space-y-1">
              {legionTasks.slice(0, 3).map((task) => {
                const priorityColor = task.priority === "P0" ? "#ef4444" : task.priority === "P1" ? "#f97316" : "#64748b";
                return (
                  <div key={task.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-[var(--bg)]">
                    <span className="font-bold" style={{color: priorityColor}}>{task.priority}</span>
                    <span className="flex-1 truncate text-[var(--text)]">{task.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.status === "done" ? "bg-green-500/20 text-green-400" :
                      task.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" :
                      task.status === "review" ? "bg-blue-500/20 text-blue-400" :
                      "bg-slate-500/20 text-slate-400"
                    }`}>
                      {task.status === "done" ? "完成" :
                       task.status === "in_progress" ? "进行中" :
                       task.status === "review" ? "待审" : "待办"}
                    </span>
                    <button
                      onClick={() => onDeleteTask(task)}
                      className="text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer"
                      title="删除任务"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
              {legionTasks.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] italic">暂无任务</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LobsterArmyPage() {
  const { t } = useI18n();
  const [legions, setLegions] = useState<Legion[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAddLegion, setShowAddLegion] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [addMemberLegionId, setAddMemberLegionId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "in_progress" | "review" | "done">("all");
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [workflowLegion, setWorkflowLegion] = useState<Legion | null>(null);
  const [executingTask, setExecutingTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<string, any>>({});
  const [dispatchTasks, setDispatchTasks] = useState<DispatchTask[]>([]);
  const [showDispatchPanel, setShowDispatchPanel] = useState(true);
  const [testNotificationAgentId, setTestNotificationAgentId] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("📋 测试通知：这是一个测试消息");
  const [stats, setStats] = useState<ProjectStats>({
    projectName: "龙虾军团V1.0",
    progress: 0,
    legions: 0,
    members: 0,
    tasks: 0,
    doneTasks: 0,
  });

  const loadData = useCallback(async () => {
    try {
      const [dataRes, tasksRes, dispatchRes] = await Promise.all([
        fetch("/lobster-army/api/data"),
        fetch("/lobster-army/api/task"),
        fetch("/api/agent/dispatch"),
      ]);
      const data = await dataRes.json();
      const tasksData = await tasksRes.json();
      const dispatchData = await dispatchRes.json();
      setLegions(data.legions || []);
      setAgents(data.agents || []);
      setTasks(tasksData.tasks || []);
      setDispatchTasks(dispatchData.tasks || []);

      const totalTasks = tasksData.tasks?.length || 0;
      const doneTasks = tasksData.tasks?.filter((t: Task) => t.status === "done").length || 0;
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      const allMembers = new Set<string>();
      (data.legions || []).forEach((l: Legion) => l.memberIds.forEach((id) => allMembers.add(id)));

      setStats({
        projectName: "龙虾军团V1.0",
        progress,
        legions: (data.legions || []).length,
        members: allMembers.size,
        tasks: totalTasks,
        doneTasks,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const createLegion = async (data: Partial<Legion>) => {
    await fetch("/lobster-army/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "legion", ...data }),
    });
    setShowAddLegion(false);
    loadData();
  };

  const createAgent = async (data: Partial<Agent>) => {
    await fetch("/lobster-army/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "agent", ...data }),
    });
    setShowAddAgent(false);
    loadData();
  };

  const addMemberToLegion = async (legionId: string, agentId: string) => {
    await fetch("/lobster-army/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "legion_member", legionId, agentId, action: "add" }),
    });
    setAddMemberLegionId(null);
    loadData();
  };

  const removeMemberFromLegion = async (legionId: string, agentId: string) => {
    await fetch("/lobster-army/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "legion_member", legionId, agentId, action: "remove" }),
    });
    loadData();
  };

  const deleteLegion = async (legionId: string) => {
    if (!confirm("确定要删除该军团吗？")) return;
    await fetch(`/lobster-army/api/data?id=${legionId}&type=legion`, { method: "DELETE" });
    loadData();
  };

  const saveLegionWorkflow = async (legionId: string, workflowSteps: any[]) => {
    await fetch("/lobster-army/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "legion", id: legionId, workflowSteps }),
    });
    setWorkflowLegion(null);
    loadData();
  };

  const deleteAgent = async (agentId: string) => {
    if (!confirm("确定要删除该成员吗？")) return;
    await fetch(`/lobster-army/api/data?id=${agentId}&type=agent`, { method: "DELETE" });
    loadData();
  };

  const importFromConfig = async () => {
    try {
      const resp = await fetch("/api/agents/config");
      const data = await resp.json();
      if (data.agents && Array.isArray(data.agents)) {
        let imported = 0;
        for (const agent of data.agents) {
          // 检查是否已存在
          if (!agents.find((a) => a.id === agent.id)) {
            await fetch("/lobster-army/api/data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "agent",
                id: agent.id,
                name: agent.name || agent.id,
                emoji: agent.emoji || "🤖",
                role: agent.role || "成员",
                status: agent.status || "offline",
              }),
            });
            imported++;
          }
        }
        if (imported > 0) {
          alert(`成功导入 ${imported} 个Agent`);
          loadData();
        } else {
          alert("没有新的Agent需要导入，所有Agent已存在");
        }
      } else {
        alert("配置中未找到Agent信息");
      }
    } catch {
      alert("导入失败，请检查配置");
    }
  };

  const createTask = async (data: Partial<Task>) => {
    await fetch("/lobster-army/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowAddTask(false);
    loadData();
  };

  // 执行任务
  const executeTask = async (task: Task, stepIndex?: number) => {
    try {
      const res = await fetch("/lobster-army/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          stepIndex,
          action: stepIndex !== undefined ? "execute" : "next"
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExecutingTask(null);
        loadData();
      } else {
        alert(data.error || "执行失败");
      }
    } catch (e) {
      console.error(e);
      alert("执行失败");
    }
  };

  // 开始任务
  const startTask = async (task: Task) => {
    try {
      // 1. 更新任务状态为进行中
      const res = await fetch("/lobster-army/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          action: "start"
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExecutingTask(null);
        
        // 2. 获取军团信息，找到任务的负责人/agent
        const legion = legions.find((l) => l.id === task.legionId);
        const agentId = task.assigneeId || legion?.leaderId;
        
        if (agentId) {
          // 3. 添加任务到Agent收件箱
          try {
            const inboxRes = await fetch("/api/agent/inbox", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: agentId,
                taskId: task.id,
                title: task.title,
                legionId: task.legionId,
                legionName: legion?.name || "",
                priority: task.priority,
                message: `🦞 龙虾军团新任务：请开始执行「${task.title}」`
              }),
            });
            const inboxData = await inboxRes.json();
            console.log("任务已添加到Agent收件箱:", inboxData);
          } catch (e) {
            console.error("添加任务到收件箱失败:", e);
          }
          
          // 4. 同时记录分发日志
          try {
            await fetch("/api/agent/dispatch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: agentId,
                message: `📋 新任务：${task.title}`,
                taskId: task.id,
                action: "start"
              }),
            });
          } catch (e) {
            console.error("分发记录失败:", e);
          }
        }
        
        loadData();
        alert(`✅ 任务已开始！已通知: ${agentId || '未知Agent'}`);
      } else {
        alert(data.error || "启动失败");
      }
    } catch (e) {
      console.error(e);
      alert("启动失败");
    }
  };

  // 完成任务
  const completeTask = async (task: Task) => {
    try {
      const res = await fetch("/lobster-army/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          action: "complete"
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExecutingTask(null);
        loadData();
      } else {
        alert(data.error || "完成失败");
      }
    } catch (e) {
      console.error(e);
      alert("完成失败");
    }
  };

  // 执行下一步骤 - 多Agent协作！
  const executeNextStep = async (task: Task) => {
    try {
      const res = await fetch("/lobster-army/api/workflow/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          stepIndex: (task.currentStep ?? 0) + 1
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${data.message}\n团队成员 ${data.workflowInfo?.currentAgent} 正在执行...`);
        loadData();
      } else {
        alert(data.error || "执行失败");
      }
    } catch (e) {
      console.error(e);
      alert("执行失败");
    }
  };

  // 标记失败
  const failTask = async (task: Task, notes: string) => {
    try {
      const res = await fetch("/lobster-army/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          action: "fail",
          notes
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExecutingTask(null);
        loadData();
      } else {
        alert(data.error || "操作失败");
      }
    } catch (e) {
      console.error(e);
      alert("操作失败");
    }
  };

  // 删除任务
  const deleteTask = async (task: Task) => {
    if (!confirm(`确定要删除任务「${task.title}」吗？`)) {
      return;
    }
    try {
      const res = await fetch(`/lobster-army/api/task?taskId=${task.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadData();
        alert("任务已删除");
      } else {
        alert(data.error || "删除失败");
      }
    } catch (e) {
      console.error(e);
      alert("删除失败");
    }
  };

  // 发送测试通知
  const sendTestNotification = async (agentId: string, message: string) => {
    if (!agentId) {
      alert("请选择Agent");
      return;
    }
    try {
      const res = await fetch("/api/agent/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentId,
          taskId: `test-${Date.now()}`,
          title: "🧪 测试通知",
          legionId: "",
          legionName: "测试",
          priority: "P2",
          message: message
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ 测试通知已发送！");
      } else {
        alert(data.error || "发送失败");
      }
    } catch (e) {
      console.error(e);
      alert("发送失败");
    }
  };

  const filteredTasks = tasks.filter((t) => taskFilter === "all" || t.status === taskFilter);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-muted)]">加载中...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🦞 龙虾军团
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Agent组织管理与任务协作
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAllAgents(!showAllAgents)}
            className={`px-3 py-2 rounded-lg border text-sm font-bold transition cursor-pointer ${
              showAllAgents ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            👥 所有成员 {agents.length}
          </button>
          <button
            onClick={() => setShowAddAgent(true)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition cursor-pointer"
          >
            + 添加成员
          </button>
          <button
            onClick={importFromConfig}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition cursor-pointer"
          >
            📥 导入配置
          </button>
          <button
            onClick={() => setShowAddLegion(true)}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-bold hover:opacity-90 transition cursor-pointer"
          >
            + 新建军团
          </button>
          <button
            onClick={() => setShowAddTask(true)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition cursor-pointer"
          >
            + 新建任务
          </button>
          <Link
            href="/agent-channel"
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition"
          >
            🤖 Agent频道 →
          </Link>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold">{stats.projectName}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {stats.tasks}个任务 · {stats.doneTasks}已完成
          </span>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-[var(--text-muted)]">
          <span>🏰 {stats.legions}军团</span>
          <span>🛡️ {stats.members}成员</span>
        </div>
      </div>

      {/* 所有成员面板 */}
      {showAllAgents && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
            <h3 className="font-bold text-sm">👥 所有成员 ({agents.length})</h3>
            <button
              onClick={() => setShowAllAgents(false)}
              className="text-[var(--text-muted)] text-xs hover:text-[var(--text)] cursor-pointer"
            >
              收起 ×
            </button>
          </div>
          <div className="p-4">
            {agents.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">暂无成员，点击「添加成员」创建</p>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => {
                  const statusColor = STATUS_COLORS[agent.status];
                  const legion = legions.find((l) => l.id === agent.legionId);
                  const isLeader = legion?.leaderId === agent.id;
                  return (
                    <div key={agent.id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/30 transition">
                      <span className="text-xl">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{agent.name}</span>
                          {isLeader && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">👑 负责人</span>}
                          {legion && !isLeader && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              {legion.emoji} {legion.name}
                            </span>
                          )}
                          {!legion && !isLeader && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">未分配军团</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] truncate">{agent.role}</p>
                      </div>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
                        title={agent.status === "online" ? "在线" : agent.status === "busy" ? "忙碌" : "离线"}
                      />
                      <button
                        onClick={() => { deleteAgent(agent.id); }}
                        className="text-xs px-2 py-1 rounded text-red-400 border border-red-500/30 hover:bg-red-500/10 transition cursor-pointer shrink-0"
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 任务看板 - 移到上方 */}
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
          <h3 className="font-bold text-sm">📋 任务看板</h3>
        </div>

        {/* 任务筛选 */}
        <div className="flex gap-1 p-2 border-b border-[var(--border)] flex-wrap">
          {(["all", "pending", "in_progress", "review", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTaskFilter(f)}
              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
                taskFilter === f
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg)]"
              }`}
            >
              {f === "all" ? "全部" :
               f === "pending" ? "待办" :
               f === "in_progress" ? "进行中" :
               f === "review" ? "待审" : "完成"}
              <span className="ml-1 opacity-60">
                ({f === "all" ? tasks.length :
                 f === "pending" ? tasks.filter(t => t.status === "pending").length :
                 f === "in_progress" ? tasks.filter(t => t.status === "in_progress").length :
                 f === "review" ? tasks.filter(t => t.status === "review").length :
                 tasks.filter(t => t.status === "done").length})
              </span>
            </button>
          ))}
        </div>

        {/* 任务列表 - 团队协作视图 */}
        <div className="p-2 space-y-3 max-h-[600px] overflow-y-auto">
          {filteredTasks.map((task) => {
            const legion = legions.find((l) => l.id === task.legionId);
            const priorityColor = task.priority === "P0" ? "#ef4444" : task.priority === "P1" ? "#f97316" : "#64748b";
            const workflowSteps = legion?.workflowSteps || [
              { id: "step-1", name: "执行", type: "execute", assigneeId: "moxiang-planner" },
              { id: "step-2", name: "审核", type: "review", assigneeId: "moxiang-writer" },
              { id: "step-3", name: "存档", type: "archive", assigneeId: "moxiang-editor" },
            ];
            const currentStep = task.currentStep ?? 0;
            const progress = task.status === "done" ? 100 : (currentStep / workflowSteps.length) * 100;
            const isInProgress = task.status === "in_progress";
            const currentAgent = agents.find(a => a.id === workflowSteps[currentStep]?.assigneeId);
            const currentAgentName = currentAgent?.name || workflowSteps[currentStep]?.assigneeId || "待分配";

            return (
              <div key={task.id} className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/50 transition">
                {/* 任务头部 */}
                <div className="flex items-start gap-2 mb-3">
                  <span className="font-bold text-xs shrink-0" style={{color: priorityColor}}>{task.priority}</span>
                  <span className="text-sm font-medium flex-1">{task.title}</span>
                  <button
                    onClick={() => deleteTask(task)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer"
                    title="删除任务"
                  >
                    🗑️
                  </button>
                </div>

                {/* 军团信息 */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-3">
                  {legion && <span className="flex items-center gap-1">{legion.emoji} {legion.name}</span>}
                  <span className="text-[var(--border)]">|</span>
                  <span className={`flex items-center gap-1 ${
                    task.status === "done" ? "text-green-400" :
                    task.status === "in_progress" ? "text-yellow-400" :
                    "text-slate-400"
                  }`}>
                    {task.status === "done" ? "✅ 已完成" :
                     task.status === "in_progress" ? `🔄 ${currentAgentName} 执行中` :
                     task.status === "review" ? "👀 待审核" : "⏳ 等待开始"}
                  </span>
                </div>

                {/* 团队协作进度条 */}
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                    <span>团队进度</span>
                    <span>{task.status === "done" ? "100%" : `${Math.round(progress)}%`}</span>
                  </div>
                  <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${progress}%`,
                        background: task.status === "done" 
                          ? "linear-gradient(90deg, #22c55e, #4ade80)" 
                          : "linear-gradient(90deg, #3b82f6, #60a5fa)"
                      }}
                    />
                  </div>
                </div>

                {/* 团队成员步骤状态 */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {workflowSteps.map((step: any, idx: number) => {
                    const stepAgent = agents.find(a => a.id === step.assigneeId);
                    const isCompleted = idx < currentStep;
                    const isCurrent = idx === currentStep && task.status === "in_progress";
                    const isPending = idx > currentStep;

                    return (
                      <div 
                        key={step.id} 
                        className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg min-w-[70px] ${
                          isCompleted ? "bg-green-500/20 border border-green-500/30" :
                          isCurrent ? "bg-blue-500/20 border border-blue-500/50" :
                          "bg-[var(--card)] border border-[var(--border)]"
                        }`}
                        title={`${step.name}: ${stepAgent?.name || step.assigneeId || "待分配"}`}
                      >
                        <span className="text-base">
                          {isCompleted ? "✅" : isCurrent ? "🔄" : "⏳"}
                        </span>
                        <span className={`text-[10px] font-medium ${
                          isCompleted ? "text-green-400" :
                          isCurrent ? "text-blue-400" :
                          "text-[var(--text-muted)]"
                        }`}>
                          {stepAgent?.emoji || "👤"}{stepAgent?.name?.slice(0, 3) || step.assigneeId?.slice(0, 4) || "待"}
                        </span>
                        <span className="text-[8px] text-[var(--text-muted)] truncate max-w-[60px]">
                          {step.name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 当前执行信息和操作按钮 */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    {isInProgress && currentAgent && (
                      <div className="flex items-center gap-1 text-xs">
                        <span>{currentAgent.emoji}</span>
                        <span className="text-[var(--text-muted)]">负责: <span className="text-blue-400">{currentAgent.name}</span></span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status === "pending" && (
                      <button
                        onClick={() => startTask(task)}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition cursor-pointer font-medium"
                      >
                        🚀 启动团队
                      </button>
                    )}
                    {task.status === "in_progress" && (
                      <>
                        <button
                          onClick={() => executeNextStep(task)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition cursor-pointer font-medium"
                        >
                          ⚡ 下一步骤
                        </button>
                        <button
                          onClick={() => completeTask(task)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition cursor-pointer font-medium"
                        >
                          ✅ 完成全部
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <p className="text-center text-[var(--text-muted)] text-sm py-8">暂无任务</p>
          )}
        </div>
      </div>

      {/* Agent状态概览 - 移到上方 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden p-4 mb-6">
        <h3 className="font-bold text-sm mb-3">👥 Agent状态</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {agents.slice(0, 6).map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg)]">
              <span className="text-lg">{agent.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{agent.name}</p>
                <p className={`text-[10px] ${
                  agent.status === 'online' ? 'text-green-400' :
                  agent.status === 'busy' ? 'text-yellow-400' : 'text-slate-400'
                }`}>
                  {agent.status === 'online' ? '在线' : agent.status === 'busy' ? '工作中' : '离线'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 🔔 SRE 巡检服务 */}
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👮</span>
            <h3 className="font-bold text-sm">SRE 巡检服务</h3>
            <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded">自动触发等待中的任务</span>
          </div>
          <button
            onClick={async () => {
              try {
                const btn = document.activeElement as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = "🔄 巡检中...";
                
                const res = await fetch("/lobster-army/api/sre/patrol");
                const data = await res.json();
                
                if (data.success) {
                  alert(`✅ SRE巡检完成\n\n检查任务: ${data.checked}个\n触发执行: ${data.triggered}个\n跳过: ${data.skipped}个`);
                } else {
                  alert(`❌ 巡检失败: ${data.error}`);
                }
                
                btn.disabled = false;
                btn.textContent = "👮 SRE巡检";
              } catch (e) {
                console.error(e);
                alert("巡检失败");
              }
            }}
            className="px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-bold hover:bg-yellow-500/30 transition cursor-pointer"
          >
            👮 SRE巡检
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          💡 SRE巡检会自动检查所有进行中的任务，如果某个步骤等待超过5分钟未执行，会自动触发对应Agent开始工作
        </p>
      </div>

      {/* 团队架构 - 全宽 */}
      <div className="space-y-4 mb-6">
        <h2 className="font-bold text-lg">🏰 团队架构</h2>
        {legions.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
            <p className="text-3xl mb-3">🦞</p>
            <p className="text-[var(--text-muted)]">还没有军团</p>
            <button
              onClick={() => setShowAddLegion(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-bold hover:opacity-90 cursor-pointer"
            >
              创建第一个军团
            </button>
          </div>
        ) : (
          legions.map((legion, idx) => (
            <LegionPanel
              key={legion.id}
              legion={legion}
              agents={agents}
              tasks={tasks}
              color={LEGION_COLORS[idx % LEGION_COLORS.length]}
              onAgentClick={setSelectedAgent}
              onAddMember={setAddMemberLegionId}
              onRemoveMember={removeMemberFromLegion}
              onDeleteLegion={deleteLegion}
              onEditWorkflow={setWorkflowLegion}
              onDeleteTask={deleteTask}
            />
          ))
        )}
      </div>

      {/* Agent详情弹窗 */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedAgent(null)}>
          <div className="w-full max-w-sm bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{selectedAgent.emoji}</span>
              <div>
                <h3 className="font-bold text-lg">{selectedAgent.name}</h3>
                <p className="text-sm text-[var(--text-muted)]">{selectedAgent.role}</p>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="ml-auto text-2xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">状态</span>
                <span style={{ color: STATUS_COLORS[selectedAgent.status] }}>
                  {selectedAgent.status === "online" ? "🟢 在线" :
                   selectedAgent.status === "busy" ? "🟡 忙碌" : "🔴 离线"}
                </span>
              </div>
              {selectedAgent.currentTask && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">当前任务</span>
                  <span className="text-xs">{selectedAgent.currentTask}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">任务队列</span>
                <span>{selectedAgent.taskQueue.length}个</span>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { deleteAgent(selectedAgent.id); setSelectedAgent(null); }}
                className="flex-1 px-4 py-2 rounded-lg border border-red-500/50 text-red-400 text-sm font-bold hover:bg-red-500/10 transition cursor-pointer"
              >
                🗑️ 删除成员
              </button>
              <button
                onClick={() => setSelectedAgent(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建军团弹窗 */}
      {showAddLegion && (
        <AddLegionModal
          agents={agents}
          onClose={() => setShowAddLegion(false)}
          onCreate={createLegion}
        />
      )}

      {/* 添加成员弹窗 */}
      {showAddAgent && (
        <AddAgentModal
          legions={legions}
          onClose={() => setShowAddAgent(false)}
          onCreate={createAgent}
        />
      )}

      {/* 新建任务弹窗 */}
      {showAddTask && (
        <AddTaskModal
          legions={legions}
          onClose={() => setShowAddTask(false)}
          onCreate={createTask}
        />
      )}

      {/* 增加成员到军团弹窗 */}
      {addMemberLegionId && (
        <LegionAddMemberModal
          legion={legions.find((l) => l.id === addMemberLegionId)!}
          agents={agents}
          onClose={() => setAddMemberLegionId(null)}
          onAdd={(agentId) => addMemberToLegion(addMemberLegionId, agentId)}
        />
      )}

      {/* 工作流编辑弹窗 */}
      {workflowLegion && (
        <LegionWorkflowModal
          legion={workflowLegion}
          agents={agents}
          onClose={() => setWorkflowLegion(null)}
          onSave={(steps) => saveLegionWorkflow(workflowLegion.id, steps)}
        />
      )}

      {/* 任务执行弹窗 */}
      {executingTask && (
        <TaskExecuteModal
          task={executingTask}
          legion={legions.find((l) => l.id === executingTask.legionId)}
          onClose={() => setExecutingTask(null)}
          onExecute={(task, stepIndex) => executeTask(task, stepIndex)}
          onComplete={(task) => completeTask(task)}
          onFail={(task, notes) => failTask(task, notes)}
        />
      )}
    </main>
  );
}

function AddLegionModal({ agents, onClose, onCreate }: { agents: Agent[]; onClose: () => void; onCreate: (d: Partial<Legion>) => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎖️");
  const [leaderId, setLeaderId] = useState("");
  const EMOJIS = ["🎖️", "🏰", "⚔️", "🔧", "🎨", "🧪", "📊", "🚀", "💎", "🔥"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6">
        <h3 className="font-bold text-lg mb-4">新建军团</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">军团名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm" placeholder="工程军团" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">图标</label>
            <div className="flex gap-2 flex-wrap">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} className={`w-8 h-8 rounded text-lg flex items-center justify-center ${emoji === e ? "border-2 border-[var(--accent)] bg-[var(--accent)]/20" : "border border-[var(--border)]"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">负责人</label>
            <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm">
              <option value="">选择负责人</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => onCreate({ name, emoji, leaderId })} className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-bold text-sm hover:opacity-90 cursor-pointer">
            创建
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] font-bold text-sm">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAgentModal({ legions, onClose, onCreate }: { legions: Legion[]; onClose: () => void; onCreate: (d: Partial<Agent>) => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛡️");
  const [role, setRole] = useState("成员");
  const [legionId, setLegionId] = useState("");
  const EMOJIS = ["🛡️", "👑", "🎖️", "🔧", "🎨", "🧪", "📊", "🚀", "💎", "🔥", "⚔️", "🏰"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6">
        <h3 className="font-bold text-lg mb-4">添加成员</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">成员名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm" placeholder="Agent名称，如：前端工程师" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">角色</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm" placeholder="输入角色名称，如：前端工程师" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">图标</label>
            <div className="flex gap-2 flex-wrap">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)} className={`w-8 h-8 rounded text-lg flex items-center justify-center ${emoji === e ? "border-2 border-[var(--accent)] bg-[var(--accent)]/20" : "border border-[var(--border)]"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">所属军团（可选）</label>
            <select value={legionId} onChange={(e) => setLegionId(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm">
              <option value="">暂不分配军团</option>
              {legions.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              if (!name.trim()) { alert("请输入成员名称"); return; }
              onCreate({ name: name.trim(), emoji, role, legionId: legionId || undefined, childIds: [], taskQueue: [] });
            }}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-bold text-sm hover:opacity-90 cursor-pointer"
          >
            添加
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] font-bold text-sm">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTaskModal({ legions, onClose, onCreate }: { legions: Legion[]; onClose: () => void; onCreate: (d: Partial<Task>) => void }) {
  const [title, setTitle] = useState("");
  const [legionId, setLegionId] = useState("");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6">
        <h3 className="font-bold text-lg mb-4">新建任务</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">任务名称</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm" placeholder="前端登录页开发" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">所属军团</label>
            <select value={legionId} onChange={(e) => setLegionId(e.target.value)} className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm">
              <option value="">选择军团</option>
              {legions.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">优先级</label>
            <div className="flex gap-2">
              {(["P0", "P1", "P2"] as const).map((p) => (
                <button key={p} onClick={() => setPriority(p)} className={`flex-1 py-2 rounded font-bold text-sm ${
                  priority === p ? "border-2 border-[var(--accent)] bg-[var(--accent)]/20" : "border border-[var(--border)]"
                }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => onCreate({ title, legionId, priority })} className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-bold text-sm hover:opacity-90 cursor-pointer">
            创建
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] font-bold text-sm">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function LegionAddMemberModal({
  legion,
  agents,
  onClose,
  onAdd,
}: {
  legion: Legion;
  agents: Agent[];
  onClose: () => void;
  onAdd: (agentId: string) => void;
}) {
  // Available agents: not in this legion's memberIds and not the legion leader
  const availableAgents = agents.filter(
    (a) => !legion.memberIds.includes(a.id) && a.id !== legion.leaderId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">增加成员到 {legion.emoji} {legion.name}</h3>
          <button onClick={onClose} className="text-2xl text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">×</button>
        </div>
        {availableAgents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">🛡️</p>
            <p className="text-sm text-[var(--text-muted)]">暂无可添加的成员</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">先通过「添加成员」创建新成员</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {availableAgents.map((agent) => {
              const statusColor = STATUS_COLORS[agent.status];
              return (
                <button
                  key={agent.id}
                  onClick={() => onAdd(agent.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)] transition cursor-pointer text-left"
                >
                  <span className="text-xl">{agent.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{agent.role}</p>
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
                  />
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg border border-[var(--border)] font-bold text-sm">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}


// 拖拽式工作流编辑器 - 支持条件分支
function LegionWorkflowModal({
  legion,
  agents,
  onClose,
  onSave,
}: {
  legion: Legion;
  agents: Agent[];
  onClose: () => void;
  onSave: (steps: any[]) => void;
}) {
  const [steps, setSteps] = useState(
    (legion.workflowSteps || []).map((s) => ({ 
      ...s, 
      assigneeId: s.assigneeId || "",
      // 新增条件分支字段
      conditionType: s.conditionType || "none", // none | pass | fail
      failNext: s.failNext ?? null, // 失败时跳转的步骤索引
    }))
  );
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const STEP_TYPES = [
    { value: "execute", icon: "⚡", label: "执行", color: "#3b82f6" },
    { value: "review", icon: "👀", label: "审核", color: "#f59e0b" },
    { value: "archive", icon: "📦", label: "存档", color: "#6b7280" },
    { value: "deploy", icon: "🚀", label: "部署", color: "#10b981" },
    { value: "test", icon: "🧪", label: "测试", color: "#8b5cf6" },
  ];

  const BRANCH_TYPES = [
    { value: "none", icon: "➖", label: "普通步骤", color: "#6b7280" },
    { value: "pass", icon: "✅", label: "通过→下一步", color: "#22c55e" },
    { value: "fail", icon: "❌", label: "不通过→返回", color: "#ef4444" },
  ];

  const members = agents.filter((a) => legion.memberIds.includes(a.id) || a.id === legion.leaderId);
  const uniqueMembers = members.reduce<Agent[]>((acc, curr) => {
    if (!acc.find((a) => a.id === curr.id)) acc.push(curr);
    return acc;
  }, []);

  const addStep = (type: string) => {
    const stepType = STEP_TYPES.find(t => t.value === type) || STEP_TYPES[0];
    setSteps([
      ...steps,
      { id: `step-${Date.now()}`, name: stepType.label, type, assigneeId: "", conditionType: "none", failNext: null },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
  };

  // 拖拽排序
  const handleDragStart = (e: any, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: any, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: any, dropIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIdx) return;
    const newSteps = [...steps];
    const [removed] = newSteps.splice(draggedIdx, 1);
    newSteps.splice(dropIdx, 0, removed);
    setSteps(newSteps);
    setDraggedIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  // 判断步骤是否被其他步骤引用为failNext
  const isStepReferencedAsFailNext = (idx: number) => {
    return steps.some(s => s.failNext === idx);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">🎨 工作流设计器 - {legion.emoji} {legion.name}</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">🖱️ 拖拽排序 | 📝 点击编辑 | 🔀 支持条件分支（通过/不通过）</p>
          </div>
          <button onClick={onClose} className="text-2xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>

        {/* 添加步骤按钮 */}
        <div className="mb-4 p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-2">➕ 添加步骤：</p>
          <div className="flex gap-2 flex-wrap">
            {STEP_TYPES.map((st) => (
              <button
                key={st.value}
                onClick={() => addStep(st.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition cursor-pointer text-sm flex items-center gap-1"
                style={{ borderLeftColor: st.color, borderLeftWidth: "3px" }}
              >
                <span>{st.icon}</span>
                <span>{st.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 条件分支类型说明 */}
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-xs text-blue-400 mb-2">💡 条件分支说明：</p>
          <div className="flex gap-4 text-xs">
            <span>✅ <b>通过</b> → 继续执行下一步</span>
            <span>❌ <b>不通过</b> → 跳转到指定的步骤重新执行</span>
          </div>
        </div>

        {/* 工作流画布 */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {steps.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-[var(--text-muted)]">还没有工作流步骤</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">点击上方按钮添加步骤</p>
            </div>
          )}
          
          {steps.map((step: any, idx: number) => {
            const stepType = STEP_TYPES.find(t => t.value === step.type) || STEP_TYPES[0];
            const branchType = BRANCH_TYPES.find(t => t.value === step.conditionType) || BRANCH_TYPES[0];
            const isDragging = draggedIdx === idx;
            const assignedAgent = uniqueMembers.find(a => a.id === step.assigneeId);
            const isReferenced = isStepReferencedAsFailNext(idx);

            return (
              <div
                key={step.id}
                className={`p-4 rounded-xl border-2 transition-all ${
                  isDragging
                    ? "border-[var(--accent)] opacity-50 bg-[var(--accent)]/10 scale-[0.98]"
                    : isReferenced
                    ? "border-orange-400 bg-orange-500/5"
                    : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/50"
                }`}
                style={{ borderLeftColor: stepType.color, borderLeftWidth: "4px" }}
              >
                {/* 步骤头部 */}
                <div className="flex items-center gap-3 mb-3">
                  {/* 拖拽把手 - 只有这个元素可以拖拽 */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className="text-[var(--text-muted)] cursor-grab active:cursor-grabbing text-lg select-none"
                  >
                    ⋮⋮
                  </div>

                  {/* 步骤序号 */}
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: stepType.color }}
                  >
                    {idx + 1}
                  </div>

                  {/* 步骤名称 */}
                  <input
                    value={step.name}
                    onChange={(e) => updateStep(idx, "name", e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-transparent bg-transparent hover:border-[var(--border)] focus:border-[var(--accent)] text-sm font-medium"
                    placeholder="步骤名称..."
                  />

                  {/* 步骤类型 */}
                  <select
                    value={step.type}
                    onChange={(e) => updateStep(idx, "type", e.target.value)}
                    className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--card)] text-xs"
                  >
                    {STEP_TYPES.map((st) => (
                      <option key={st.value} value={st.value}>{st.icon} {st.label}</option>
                    ))}
                  </select>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => removeStep(idx)}
                    className="px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition cursor-pointer text-xs"
                    title="删除步骤"
                  >
                    🗑️
                  </button>
                </div>

                {/* 步骤详情 */}
                <div className="flex items-center gap-3 pl-11">
                  {/* 负责人 */}
                  <select
                    value={step.assigneeId || ""}
                    onChange={(e) => updateStep(idx, "assigneeId", e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs"
                  >
                    <option value="">👤 选择Agent</option>
                    {uniqueMembers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.emoji} {a.name} {a.id === legion.leaderId ? "👑" : ""}
                      </option>
                    ))}
                  </select>

                  {/* 分支类型 */}
                  <select
                    value={step.conditionType || "none"}
                    onChange={(e) => updateStep(idx, "conditionType", e.target.value)}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                    style={{ 
                      borderColor: branchType.color,
                      color: branchType.color,
                      backgroundColor: `${branchType.color}10`
                    }}
                  >
                    {BRANCH_TYPES.map((bt) => (
                      <option key={bt.value} value={bt.value}>{bt.icon} {bt.label}</option>
                    ))}
                  </select>

                  {/* 不通过时跳转目标（当选择"不通过"时显示） */}
                  {step.conditionType === "fail" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)]">↩️ 跳转到：</span>
                        <select
                          value={step.failNext !== undefined && step.failNext !== null ? step.failNext : ""}
                          onChange={(e) => updateStep(idx, "failNext", e.target.value !== "" ? parseInt(e.target.value) : null)}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs flex-1"
                        >
                          <option value="">-- 选择步骤编号 --</option>
                          {steps.map((s: any, sIdx: number) => (
                            sIdx !== idx ? (
                              <option key={sIdx} value={sIdx}>
                                步骤{sIdx + 1}: {s.name || "未命名"}
                              </option>
                            ) : null
                          ))}
                        </select>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        💡 选择不通过时要返回的步骤编号（可以是之前的任何步骤）
                      </p>
                    </div>
                  )}

                  {/* 被引用提示 */}
                  {isReferenced && (
                    <span className="text-xs text-orange-400 bg-orange-500/20 px-2 py-1 rounded">
                      ⚠️ 被其他步骤引用
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 拖拽提示 */}
        {steps.length > 1 && (
          <div className="text-center mb-4">
            <p className="text-xs text-[var(--text-muted)]">💡 拖拽把手可调整步骤顺序 | 🔀 审核类步骤可设置"通过/不通过"分支</p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm"
          >
            取消
          </button>
          <button
            onClick={() => onSave(steps)}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] font-bold text-sm hover:opacity-90 cursor-pointer"
          >
            💾 保存工作流 ({steps.length}个步骤)
          </button>
        </div>
      </div>
    </div>
  );
}

// 任务执行弹窗
function TaskExecuteModal({
  task,
  legion,
  onClose,
  onExecute,
  onComplete,
  onFail,
}: {
  task: Task;
  legion?: Legion;
  onClose: () => void;
  onExecute: (task: Task, stepIndex?: number) => void;
  onComplete: (task: Task) => void;
  onFail: (task: Task, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [notificationSent, setNotificationSent] = useState(false);
  const [agentId, setAgentId] = useState<string>("");

  const defaultSteps = [
    { id: "step-1", name: "执行", type: "execute" },
    { id: "step-2", name: "审核", type: "review" },
    { id: "step-3", name: "存档", type: "archive" },
  ];

  const workflowSteps = legion?.workflowSteps || defaultSteps;
  const currentStep = task.currentStep ?? 0;

  const STEP_ICONS: Record<string, string> = {
    execute: "⚡",
    review: "👀",
    test: "🧪",
    deploy: "🚀",
    archive: "📦",
  };

  const handleFail = () => {
    if (notes.trim()) {
      onFail(task, notes.trim());
    } else {
      alert("请输入失败原因");
    }
  };

  const notifyAgent = async () => {
    const targetAgentId = agentId || task.assigneeId || legion?.leaderId;
    if (!targetAgentId) {
      alert("请先选择或指定Agent");
      return;
    }

    try {
      const res = await fetch("/api/agent/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: targetAgentId,
          taskId: task.id,
          title: task.title,
          legionId: task.legionId,
          legionName: legion?.name || "",
          priority: task.priority,
          message: `🦞 龙虾军团任务通知：${task.title}`
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotificationSent(true);
        // 同时记录分发
        await fetch("/api/agent/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: targetAgentId,
            message: `📋 任务通知：${task.title}`,
            taskId: task.id,
            action: "notify"
          }),
        });
        alert("✅ 已通知Agent: " + targetAgentId);
      } else {
        alert(data.error || "通知失败");
      }
    } catch (e) {
      console.error(e);
      alert("通知失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--card)] border-2 border-[var(--border)] rounded-xl p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              ⚡ 任务执行
            </h3>
            <p className="text-sm text-[var(--accent)] mt-1">{task.title}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            ×
          </button>
        </div>

        {/* Task Info */}
        <div className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
            {legion && <span>{legion.emoji} {legion.name}</span>}
            <span className={`px-2 py-0.5 rounded ${
              task.status === "done" ? "bg-green-500/20 text-green-400" :
              task.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" :
              task.status === "review" ? "bg-blue-500/20 text-blue-400" :
              "bg-slate-500/20 text-slate-400"
            }`}>
              {task.status === "done" ? "✅ 完成" :
               task.status === "in_progress" ? "🔄 进行中" :
               task.status === "review" ? "👀 待审核" : "⏳ 待办"}
            </span>
            <span className="ml-auto">优先级: <strong>{task.priority}</strong></span>
          </div>
        </div>

        {/* Workflow Steps */}
        <div className="mb-4">
          <p className="text-sm font-bold mb-2">📋 工作流步骤</p>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {workflowSteps.map((step: any, idx: number) => {
              const isCompleted = idx < currentStep;
              const isCurrent = idx === currentStep;
              const isPending = idx > currentStep;
              const hasCondition = step.conditionType === "pass" || step.conditionType === "fail";

              return (
                <div
                  key={step.id}
                  className={`flex flex-col gap-2 p-3 rounded-lg border transition ${
                    isCompleted ? "border-green-500/30 bg-green-500/10" :
                    isCurrent ? "border-[var(--accent)] bg-[var(--accent)]/10" :
                    "border-[var(--border)] bg-[var(--bg)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {isCompleted ? "✅" : isCurrent ? STEP_ICONS[step.type] || "⚡" : "⏳"}
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${isPending ? "text-[var(--text-muted)]" : ""}`}>
                        {idx + 1}. {step.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {STEP_ICONS[step.type] || "⚡"} {step.type}
                        {step.assigneeId && ` · ${step.assigneeId}`}
                      </p>
                    </div>
                    {hasCondition && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        step.conditionType === "pass" 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {step.conditionType === "pass" ? "✅ 通过→下一步" : "❌ 不通过→返回"}
                      </span>
                    )}
                    {isCurrent && (
                      <button
                        onClick={() => onExecute(task, idx)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:opacity-90 cursor-pointer"
                      >
                        执行
                      </button>
                    )}
                  </div>
                  {/* 分支跳转信息 */}
                  {step.conditionType === "fail" && step.failNext !== null && step.failNext !== undefined && (
                    <div className="flex items-center gap-2 pl-8 text-xs text-orange-400">
                      <span>↩️ 不通过时跳转到：步骤{step.failNext + 1} ({workflowSteps[step.failNext]?.name || "未知"})</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent通知 */}
        <div className="mb-4">
          <p className="text-sm font-bold mb-2">📬 Agent通知</p>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex gap-2 mb-2">
              <select
                value={agentId || task.assigneeId || ""}
                onChange={(e) => setAgentId(e.target.value)}
                className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
              >
                <option value="">选择Agent...</option>
                {legion && [
                  legion.leaderId && (
                    <option key={legion.leaderId} value={legion.leaderId}>
                      👑 {legion.leaderId} (负责人)
                    </option>
                  ),
                  ...legion.memberIds.map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))
                ].filter(Boolean)}
              </select>
              <button
                onClick={notifyAgent}
                disabled={notificationSent}
                className={`px-4 py-2 rounded-lg text-white text-sm font-bold hover:opacity-90 cursor-pointer ${
                  notificationSent
                    ? "bg-green-600 cursor-not-allowed"
                    : "bg-blue-500"
                }`}
              >
                {notificationSent ? "✅ 已通知" : "📤 通知Agent"}
              </button>
            </div>
            {notificationSent && (
              <p className="text-xs text-green-400">
                ✓ 任务通知已发送到Agent收件箱
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-4">
          <p className="text-sm font-bold mb-2">🚀 快捷操作</p>
          <div className="flex gap-2 flex-wrap">
            {task.status === "pending" && (
              <button
                onClick={() => onExecute(task)}
                className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-bold hover:opacity-90 cursor-pointer"
              >
                🚀 开始任务
              </button>
            )}
            {/* 审核类步骤显示"通过"和"不通过"按钮 */}
            {task.status === "in_progress" && workflowSteps[currentStep]?.type === "review" && (
              <>
                <button
                  onClick={() => {
                    // 调用 approve API
                    fetch("/lobster-army/api/execute", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        taskId: task.id,
                        action: "approve",
                        notes: notes || "审核通过"
                      }),
                    }).then(res => res.json()).then(data => {
                      if (data.success) {
                        alert(data.message);
                        onClose();
                      }
                    });
                  }}
                  className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-bold hover:opacity-90 cursor-pointer"
                >
                  ✅ 通过
                </button>
                <button
                  onClick={() => {
                    if (!notes.trim()) {
                      alert("请输入不通过的原因");
                      return;
                    }
                    // 调用 reject API
                    fetch("/lobster-army/api/execute", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        taskId: task.id,
                        action: "reject",
                        notes: notes || "审核不通过"
                      }),
                    }).then(res => res.json()).then(data => {
                      if (data.success) {
                        alert(data.message);
                        onClose();
                      }
                    });
                  }}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:opacity-90 cursor-pointer"
                >
                  ❌ 不通过
                </button>
              </>
            )}
            {task.status !== "done" && task.status !== "archived" && task.status !== "in_progress" && (
              <button
                onClick={() => onComplete(task)}
                className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:opacity-90 cursor-pointer"
              >
                ✅ 完成全部
              </button>
            )}
          </div>
        </div>

        {/* Fail Section */}
        <div className="mt-auto pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-2">标记失败原因：</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-sm resize-none"
            rows={2}
            placeholder="输入失败原因..."
          />
          <button
            onClick={handleFail}
            className="mt-2 w-full px-4 py-2 rounded-lg border border-red-500/50 text-red-400 text-sm font-bold hover:bg-red-500/10 transition cursor-pointer"
          >
            ❌ 标记失败
          </button>
        </div>

        {/* Close Button */}
        <div className="mt-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-[var(--border)] font-bold text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
