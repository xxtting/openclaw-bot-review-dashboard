// ============================================================
// Agent专用交互频道 - 数据模型
// ============================================================

export type MessageType = "normal" | "task" | "file" | "command" | "system" | "memory";
export type ChannelType = "legion" | "project" | "broadcast" | "command";

// 频道成员
export interface ChannelMember {
  agentId: string;
  joinedAt: string;
  role: "leader" | "member";
  unreadCount: number;
}

// 频道
export interface AgentChannel {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: ChannelType;
  legionId?: string;        // 如果是军团频道
  projectId?: string;       // 如果是项目频道
  members: ChannelMember[];
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

// 消息
export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;         // Agent ID
  senderName: string;
  senderEmoji: string;
  senderRole: string;       // 角色标签
  type: MessageType;
  content: string;
  mentions: string[];       // @提到的Agent IDs
  reactions: Record<string, string[]>; // emoji -> [agentId,...]
  attachments?: Attachment[];
  relatedTaskId?: string;   // 关联任务ID
  isFromBoss: boolean;      // 是否来自BOSS
  createdAt: string;
}

// 附件
export interface Attachment {
  id: string;
  name: string;
  type: "code" | "image" | "document" | "link";
  url?: string;
  content?: string;          // 代码片段等
}

// 记忆记录
export interface MemoryEntry {
  id: string;
  channelId: string;
  key: string;
  summary: string;
  context: string;
  importance: "low" | "medium" | "high";
  agentIds: string[];      // 关联的Agent
  createdAt: string;
}

// 上下文摘要
export interface ContextSummary {
  channelId: string;
  summary: string;
  keyDecisions: string[];
  pendingTasks: string[];
  updatedAt: string;
}
