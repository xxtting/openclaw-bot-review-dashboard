// ============================================================
// 龙虾军团 - 数据模型
// ============================================================

export type AgentStatus = "online" | "busy" | "offline";
export type TaskStatus = "pending" | "in_progress" | "review" | "archived" | "done";
export type TaskPriority = "P0" | "P1" | "P2";

// Agent节点
export interface LobsterAgent {
  id: string;           // 唯一标识
  name: string;          // 显示名称
  emoji: string;         // 头像emoji
  role: string;          // 角色描述
  status: AgentStatus;   // 在线/忙碌/离线
  legionId?: string;     // 所属军团ID
  parentId?: string;     // 上级Agent ID
  childIds: string[];    // 下属Agent IDs
  currentTask?: string;  // 当前任务ID
  taskQueue: string[];   // 任务队列
  model?: string;        // 使用的模型
  platform?: string;     // 绑定平台
  createdAt: string;
}

// 军团
export interface Legion {
  id: string;
  name: string;              // 军团名称
  emoji: string;             // 军团图标
  leaderId: string;          // 负责人Agent ID
  memberIds: string[];       // 成员Agent IDs
  status: "idle" | "busy" | "completed";
  workflowSteps: WorkflowStep[]; // 工作流程
  color: string;             // 主题色
  createdAt: string;
}

// 工作流程步骤
export interface WorkflowStep {
  id: string;
  name: string;         // 步骤名称
  type: "execute" | "review" | "archive" | "report";
  assigneeRole?: string; // 指定角色
}

// 项目
export interface Project {
  id: string;
  name: string;         // 项目名称
  description: string;
  status: "planning" | "active" | "completed" | "archived";
  legionIds: string[];   // 参与的军团
  taskIds: string[];     // 关联的任务
  progress: number;      // 0-100
  createdAt: string;
  updatedAt: string;
}

// 任务
export interface LegionTask {
  id: string;
  projectId?: string;
  legionId: string;
  title: string;
  description: string;
  assigneeId?: string;      // 当前处理人
  assigneeName?: string;
  status: TaskStatus;
  priority: TaskPriority;
  fromBoss: boolean;         // 是否来自BOSS
  parentTaskId?: string;     // 父任务ID
  childTaskIds?: string[];   // 子任务IDs
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

// 层级关系变更记录
export interface HierarchyChange {
  type: "assign" | "unassign" | "transfer";
  agentId: string;
  fromParentId: string | null;
  toParentId: string | null;
  operatorId: string;
  timestamp: string;
}
