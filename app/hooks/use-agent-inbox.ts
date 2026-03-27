/**
 * Agent收件箱轮询机制 - 实时任务通知
 * 
 * 功能:
 * 1. SSE实时推送 (推荐)
 * 2. 定时轮询 (fallback)
 * 3. 任务状态同步
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface TaskItem {
  id: string;
  taskId: string;
  title: string;
  legionId: string;
  legionName: string;
  priority: string;
  status: string;
  createdAt: string;
  message: string;
}

interface AgentInboxResponse {
  success: boolean;
  agentId: string;
  pendingTasks: TaskItem[];
  count: number;
  lastCheck: string;
}

interface UseAgentInboxOptions {
  agentId: string;
  pollInterval?: number; // 毫秒，默认5000
  enableSSE?: boolean; // 是否启用SSE，默认true
  onNewTask?: (task: TaskItem) => void;
  onTaskComplete?: (taskId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Agent收件箱Hook - 支持SSE和轮询
 */
export function useAgentInbox({
  agentId,
  pollInterval = 5000,
  enableSSE = true,
  onNewTask,
  onTaskComplete,
  onError,
}: UseAgentInboxOptions) {
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousTasksRef = useRef<Map<string, TaskItem>>(new Map());

  // 保存上次的任务ID列表，用于检测新任务
  const getTaskIds = useCallback((tasks: TaskItem[]) => {
    return new Set(tasks.map(t => t.taskId));
  }, []);

  // 检测新任务
  const detectNewTasks = useCallback((oldTasks: TaskItem[], newTasks: TaskItem[]) => {
    const oldIds = getTaskIds(oldTasks);
    const newIds = getTaskIds(newTasks);
    
    const newTaskItems: TaskItem[] = [];
    for (const task of newTasks) {
      if (!oldIds.has(task.taskId)) {
        newTaskItems.push(task);
        if (onNewTask) {
          onNewTask(task);
        }
      }
    }
    
    return newTaskItems;
  }, [getTaskIds, onNewTask]);

  // 获取待办任务 (HTTP轮询)
  const fetchTasks = useCallback(async () => {
    if (!agentId) return;

    try {
      const response = await fetch(`/api/agent/inbox?agentId=${encodeURIComponent(agentId)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AgentInboxResponse = await response.json();
      
      if (data.success) {
        // 检测新任务
        detectNewTasks(pendingTasks, data.pendingTasks);
        
        setPendingTasks(data.pendingTasks);
        setLastCheck(data.lastCheck);
        setError(null);

        // 更新上次的任务Map
        previousTasksRef.current = new Map(
          data.pendingTasks.map(t => [t.taskId, t])
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to fetch tasks');
      setError(err);
      if (onError) onError(err);
    }
  }, [agentId, pendingTasks, detectNewTasks, onError]);

  // 启动轮询
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    // 立即获取一次
    fetchTasks();

    // 设置定时轮询
    pollTimerRef.current = setInterval(fetchTasks, pollInterval);
  }, [fetchTasks, pollInterval]);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 启动SSE连接
  const startSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/agent/inbox/sse?agentId=${encodeURIComponent(agentId)}`
    );

    eventSource.onopen = () => {
      console.log('[AgentInbox] SSE connected');
      setLoading(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'task') {
          const task: TaskItem = data.task;
          
          // 添加新任务
          setPendingTasks(prev => {
            // 检查是否已存在
            if (prev.some(t => t.taskId === task.taskId)) {
              return prev;
            }
            return [...prev, task];
          });

          if (onNewTask) {
            onNewTask(task);
          }
        } else if (data.type === 'tasks') {
          // 全量任务更新
          setPendingTasks(data.tasks);
          
          // 检测新任务
          detectNewTasks(pendingTasks, data.tasks);
        } else if (data.type === 'heartbeat') {
          // 心跳，保持连接
          console.log('[AgentInbox] SSE heartbeat');
        }
      } catch (e) {
        console.error('[AgentInbox] SSE parse error:', e);
      }
    };

    eventSource.onerror = (e) => {
      console.error('[AgentInbox] SSE error:', e);
      eventSource.close();
      
      // SSE失败时，降级到轮询
      console.log('[AgentInbox] Falling back to polling');
      startPolling();
    };

    eventSourceRef.current = eventSource;
  }, [agentId, onNewTask, pendingTasks, detectNewTasks, startPolling]);

  // 停止SSE
  const stopSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // 确认完成任务 (从收件箱移除)
  const confirmTask = useCallback(async (inboxTaskId: string) => {
    try {
      const response = await fetch(
        `/api/agent/inbox?agentId=${encodeURIComponent(agentId)}&inboxTaskId=${encodeURIComponent(inboxTaskId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // 从列表中移除
        setPendingTasks(prev => prev.filter(t => t.id !== inboxTaskId));
        
        if (onTaskComplete) {
          onTaskComplete(inboxTaskId);
        }
      }

      return data;
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to confirm task');
      if (onError) onError(err);
      throw err;
    }
  }, [agentId, onTaskComplete, onError]);

  // 执行任务
  const executeTask = useCallback(async (taskId: string, action: 'execute' | 'start' | 'complete' = 'execute') => {
    try {
      const response = await fetch('/lobster-army/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to execute task');
      if (onError) onError(err);
      throw err;
    }
  }, [onError]);

  // 启动连接
  const connect = useCallback(() => {
    setLoading(true);
    
    if (enableSSE) {
      startSSE();
    } else {
      startPolling();
    }
  }, [enableSSE, startSSE, startPolling]);

  // 断开连接
  const disconnect = useCallback(() => {
    stopSSE();
    stopPolling();
  }, [stopSSE, stopPolling]);

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // 状态
    pendingTasks,
    loading,
    error,
    lastCheck,
    
    // 操作
    connect,
    disconnect,
    fetchTasks,
    confirmTask,
    executeTask,
    
    // 统计数据
    taskCount: pendingTasks.length,
    hasHighPriority: pendingTasks.some(t => t.priority === 'P0'),
  };
}

/**
 * 任务下发Hook - 用于向Agent下发任务
 */
export function useTaskDispatch() {
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 向Agent下发任务
  const dispatchTask = useCallback(async (params: {
    agentId: string;
    taskId: string;
    title: string;
    legionId?: string;
    legionName?: string;
    priority?: string;
    message?: string;
  }) => {
    setDispatching(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to dispatch task');
      setError(err);
      throw err;
    } finally {
      setDispatching(false);
    }
  }, []);

  // 批量下发任务给多个Agent
  const dispatchToMultiple = useCallback(async (
    agentIds: string[],
    task: {
      taskId: string;
      title: string;
      legionId?: string;
      legionName?: string;
      priority?: string;
      message?: string;
    }
  ) => {
    setDispatching(true);
    setError(null);

    const results: Array<{ agentId: string; success: boolean; message?: string }> = [];

    try {
      for (const agentId of agentIds) {
        try {
          const result = await dispatchTask({ agentId, ...task });
          results.push({ agentId, success: true, message: result.message });
        } catch (e) {
          results.push({ 
            agentId, 
            success: false, 
            message: e instanceof Error ? e.message : 'Unknown error' 
          });
        }
      }

      return results;
    } finally {
      setDispatching(false);
    }
  }, [dispatchTask]);

  return {
    dispatching,
    error,
    dispatchTask,
    dispatchToMultiple,
  };
}

/**
 * 轮询状态Hook
 */
export function usePollingStatus() {
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);

  const startPolling = useCallback(() => setIsPolling(true), []);
  const stopPolling = useCallback(() => setIsPolling(false), []);
  const recordPoll = useCallback(() => setLastPollTime(new Date()), []);

  return {
    isPolling,
    lastPollTime,
    startPolling,
    stopPolling,
    recordPoll,
  };
}
