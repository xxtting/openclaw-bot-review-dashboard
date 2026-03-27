"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface ChannelMember {
  agentId: string;
  joinedAt: string;
  role: "leader" | "member";
  unreadCount: number;
}

interface AgentChannel {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: "legion" | "project" | "broadcast" | "command";
  members: ChannelMember[];
  isPrivate: boolean;
}

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderEmoji: string;
  senderRole: string;
  type: "normal" | "task" | "file" | "command" | "system" | "memory";
  content: string;
  mentions: string[];
  reactions: Record<string, string[]>;
  attachments?: any[];
  createdAt: string;
}

interface MemoryEntry {
  id: string;
  channelId: string;
  summary: string;
  createdAt: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  broadcast: "🛡️",
  legion: "🏠",
  project: "📋",
  command: "🔔",
};

function MessageBubble({ msg }: { msg: Message }) {
  const isSystem = msg.type === "system" || msg.type === "memory";
  const time = new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex gap-3 p-3 rounded-xl ${isSystem ? "bg-[var(--accent)]/10 border border-[var(--accent)]/20" : ""} ${msg.type === "command" ? "bg-purple-500/10 border border-purple-500/20" : ""}`}>
      <span className="text-2xl shrink-0">{msg.senderEmoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-bold text-sm">{msg.senderName}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            msg.senderRole === "指挥官" ? "bg-[var(--accent)]/20 text-[var(--accent)]" :
            msg.senderRole === "军团负责人" ? "bg-purple-500/20 text-purple-300" :
            "bg-slate-500/20 text-slate-400"
          }`}>
            {msg.senderRole}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{time}</span>
          {msg.type === "system" && <span className="text-[10px] text-[var(--accent)]">💾 系统</span>}
          {msg.type === "memory" && <span className="text-[10px] text-yellow-400">🧠 记忆</span>}
          {msg.type === "command" && <span className="text-[10px] text-purple-400">🔔 指令</span>}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
        {msg.mentions.length > 0 && (
          <p className="text-[10px] text-[var(--text-muted)] mt-1">提及: {msg.mentions.map((m) => `@${m}`).join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export default function AgentChannelPage() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  const loadChannels = useCallback(async () => {
    try {
      const resp = await fetch("/agent-channel/api/channel");
      const data = await resp.json();
      setChannels(data.channels || []);
      if (!selectedChannelId && (data.channels || []).length > 0) {
        setSelectedChannelId(data.channels[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId]);

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const resp = await fetch(`/agent-channel/api/message?channelId=${channelId}&limit=100`);
      const data = await resp.json();
      setMessages(data.messages || []);
      setMemory(data.memory || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  useEffect(() => {
    if (selectedChannelId) loadMessages(selectedChannelId);
  }, [selectedChannelId, loadMessages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !selectedChannelId || sending) return;
    setSending(true);

    try {
      const resp = await fetch("/agent-channel/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannelId,
          senderId: "main",
          senderName: "MAIN",
          senderEmoji: "🦞",
          senderRole: "指挥官",
          content: inputText,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setInputText("");
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* 侧边栏 */}
      <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-bold text-sm">🤖 Agent频道</h1>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="搜索频道..."
              className="w-full px-3 py-1.5 pl-8 rounded text-xs bg-[var(--bg)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs">🔍</span>
          </div>
        </div>

        {/* 频道列表 */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-1">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">频道</p>
          </div>
          {channels.map((channel) => {
            const icon = CHANNEL_ICONS[channel.type] || "💬";
            const isSelected = channel.id === selectedChannelId;
            const totalUnread = channel.members.reduce((sum, m) => sum + m.unreadCount, 0);
            return (
              <button
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition cursor-pointer ${
                  isSelected ? "bg-[var(--accent)]/20 border-l-2 border-[var(--accent)]" : "hover:bg-[var(--bg)]"
                }`}
              >
                <span className="text-lg">{icon}</span>
                <span className="flex-1 text-left truncate">{channel.name}</span>
                {totalUnread > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-[10px] flex items-center justify-center text-[var(--bg)] font-bold">
                    {totalUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 记忆状态 */}
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>🧠</span>
            <span>记忆: {memory.length}条</span>
          </div>
          <Link href="/lobster-army" className="text-xs text-[var(--accent)] hover:underline mt-1 block">
            ← 龙虾军团
          </Link>
        </div>
      </aside>

      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 频道头 */}
        {selectedChannel && (
          <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--card)] flex items-center gap-3">
            <span className="text-2xl">{CHANNEL_ICONS[selectedChannel.type] || "💬"}</span>
            <div className="flex-1">
              <h2 className="font-bold text-sm">{selectedChannel.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{selectedChannel.description}</p>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              🛡️ {selectedChannel.members.length || 0} Agent
            </div>
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {messages.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-muted)]">
              <p className="text-4xl mb-4">💬</p>
              <p>还没有消息</p>
              <p className="text-sm mt-1">发送第一条消息开始对话</p>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--card)]">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="发送消息，或 @agent-name 召唤..."
                rows={2}
                className="w-full px-4 py-2.5 pr-12 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm resize-none focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={sending || !inputText.trim()}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-bold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition shrink-0"
            >
              {sending ? "..." : "发送"}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            💡 输入 @agent名 可召唤指定Agent，按 Enter 发送
          </p>
        </div>
      </div>
    </div>
  );
}
