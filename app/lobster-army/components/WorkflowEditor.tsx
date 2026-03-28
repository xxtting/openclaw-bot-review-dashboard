"use client";

import { useState, useRef, useCallback, DragEvent } from "react";

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "deploy" | "test" | "archive";
  assigneeId?: string;
  feedbackAgentId?: string; // 不通过时反馈给哪个Agent
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

interface WorkflowEditorProps {
  steps: WorkflowStep[];
  agents: Agent[];
  onSave: (steps: WorkflowStep[]) => void;
  onClose: () => void;
}

const STEP_TYPES = [
  { type: "execute", icon: "⚡", name: "执行", color: "#3b82f6" },
  { type: "review", icon: "👀", name: "审核", color: "#f59e0b" },
  { type: "deploy", icon: "🚀", name: "部署", color: "#10b981" },
  { type: "test", icon: "🧪", name: "测试", color: "#8b5cf6" },
  { type: "archive", icon: "📦", name: "存档", color: "#6b7280" },
] as const;

export default function WorkflowEditor({ steps, agents, onSave, onClose }: WorkflowEditorProps) {
  const [localSteps, setLocalSteps] = useState<WorkflowStep[]>(steps);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  // 获取步骤类型元数据
  const getStepType = (type: string) =>
    STEP_TYPES.find((t) => t.type === type) || STEP_TYPES[0];

  // 添加新步骤
  const addStep = (type: string) => {
    const typeMeta = getStepType(type);
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: typeMeta.name,
      type: type as WorkflowStep["type"],
    };
    setLocalSteps([...localSteps, newStep]);
  };

  // 删除步骤
  const removeStep = (index: number) => {
    const stepId = localSteps[index].id;
    // 清理引用该步骤的feedbackAgentId
    const cleaned = localSteps
      .filter((_, i) => i !== index)
      .map((s) => ({
        ...s,
        feedbackAgentId: s.feedbackAgentId === stepId ? undefined : s.feedbackAgentId,
      }));
    setLocalSteps(cleaned);
  };

  // 更新步骤
  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setLocalSteps(
      localSteps.map((step, i) => (i === index ? { ...step, ...updates } : step))
    );
  };

  // 拖拽排序
  const handleDragStart = (e: DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverRef.current = index;
  };

  const handleDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newSteps = [...localSteps];
    const [removed] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(dropIndex, 0, removed);
    setLocalSteps(newSteps);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    dragOverRef.current = null;
  };

  // 保存工作流
  const handleSave = () => {
    const numberedSteps = localSteps.map((step, idx) => ({
      ...step,
      id: `step-${idx + 1}`,
    }));
    onSave(numberedSteps);
  };

  // 判断步骤在当前列表中的序号（用于显示）
  const getStepNumber = (stepId: string) => {
    const idx = localSteps.findIndex((s) => s.id === stepId);
    return idx === -1 ? null : idx + 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[var(--card)] border-2 border-[var(--border)] rounded-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">🎨 工作流设计器</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              拖拽排序 · 分配Agent · 设置条件分支
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-[var(--text-muted)] hover:text-[var(--text)] transition"
          >
            ×
          </button>
        </div>

        {/* Step Type Palette */}
        <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
          <p className="text-xs text-[var(--text-muted)] mb-2">点击添加步骤：</p>
          <div className="flex gap-2 flex-wrap">
            {STEP_TYPES.map((st) => (
              <button
                key={st.type}
                onClick={() => addStep(st.type)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)] transition cursor-pointer text-sm flex items-center gap-1"
              >
                <span>{st.icon}</span>
                <span>{st.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1 overflow-auto p-6">
          {localSteps.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-[var(--text-muted)]">还没有工作流步骤</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                点击上方按钮添加步骤
              </p>
            </div>
          ) : (
            <div className="space-y-0 relative">
              {localSteps.map((step, index) => {
                const stepType = getStepType(step.type);
                const isDragging = draggedIndex === index;
                const isEditing = editingStep === index;
                const assignedAgent = agents.find((a) => a.id === step.assigneeId);
                const isReview = step.type === "review";
                const feedbackAgent = step.feedbackAgentId
                  ? agents.find((a) => a.id === step.feedbackAgentId)
                  : null;

                return (
                  <div key={step.id}>
                    {/* Arrow from previous step */}
                    {index > 0 && (
                      <div className="flex items-center justify-center py-1">
                        <svg width="24" height="20" className="text-[var(--border)]">
                          <line
                            x1="12" y1="0" x2="12" y2="14"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeDasharray="3 2"
                          />
                          <polygon
                            points="12,20 8,14 16,14"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Step Card */}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                        isDragging
                          ? "border-[var(--accent)] opacity-50 bg-[var(--accent)]/10"
                          : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/50"
                      }`}
                    >
                      {/* Drag Handle */}
                      <div className="text-[var(--text-muted)] cursor-grab active:cursor-grabbing pt-1 select-none">
                        ⋮⋮
                      </div>

                      {/* Step Number */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: stepType.color }}
                      >
                        {index + 1}
                      </div>

                      {/* Step Content */}
                      {isEditing ? (
                        <div className="flex-1 space-y-3">
                          <div className="flex gap-3 items-center flex-wrap">
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) =>
                                updateStep(index, { name: e.target.value })
                              }
                              className="flex-1 min-w-[160px] px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                              placeholder="步骤名称"
                              autoFocus
                            />
                            <select
                              value={step.type}
                              onChange={(e) =>
                                updateStep(index, {
                                  type: e.target.value as WorkflowStep["type"],
                                })
                              }
                              className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                            >
                              {STEP_TYPES.map((st) => (
                                <option key={st.type} value={st.type}>
                                  {st.icon} {st.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={step.assigneeId || ""}
                              onChange={(e) =>
                                updateStep(index, {
                                  assigneeId: e.target.value || undefined,
                                })
                              }
                              className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                            >
                              <option value="">选择Agent...</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.emoji} {a.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Review-specific options */}
                          {isReview && (
                            <div className="border-t border-[var(--border)] pt-3 space-y-2">
                              <div className="text-xs text-[var(--text-muted)] mb-2">
                                📌 审核规则：<span className="text-green-400">✅ 通过 → 进入下一步</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-sm text-[var(--text-muted)] whitespace-nowrap">
                                  ❌ 不通过时反馈给：
                                </label>
                                <select
                                  value={step.feedbackAgentId || ""}
                                  onChange={(e) =>
                                    updateStep(index, {
                                      feedbackAgentId: e.target.value || undefined,
                                    })
                                  }
                                  className="flex-1 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                                >
                                  <option value="">— 请选择 —</option>
                                  {agents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.emoji} {a.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => setEditingStep(null)}
                            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-bold hover:opacity-90 transition"
                          >
                            ✓ 确认
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            {/* Row 1: name + type badge */}
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-lg">{stepType.icon}</span>
                              <span className="font-medium">{step.name}</span>
                              <span
                                className="px-2 py-0.5 rounded text-xs text-white"
                                style={{ backgroundColor: stepType.color }}
                              >
                                {stepType.name}
                              </span>
                              {isReview && step.feedbackAgentId && (
                                <span className="px-2 py-0.5 rounded text-xs bg-orange-500 text-white">
                                  ❌ 不通过→{feedbackAgent?.emoji}{feedbackAgent?.name}
                                </span>
                              )}
                            </div>
                            {/* Row 2: agent + condition */}
                            <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] flex-wrap">
                              {assignedAgent ? (
                                <span className="flex items-center gap-1">
                                  <span>{assignedAgent.emoji}</span>
                                  <span>{assignedAgent.name}</span>
                                  <span className="text-xs text-[var(--text-muted)]">
                                    ({assignedAgent.role})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-orange-400 flex items-center gap-1">
                                  ⚠️ 未分配Agent
                                </span>
                              )}
                              {isReview && (
                                <>
                                  <span className="text-[var(--border)]">|</span>
                                  <span className="text-green-400 flex items-center gap-1">
                                    ✅ 通过 → 下一工序
                                  </span>
                                  {feedbackAgent ? (
                                    <span className="text-red-400 flex items-center gap-1">
                                      ❌ 不通过 → {feedbackAgent.emoji}{feedbackAgent.name}
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <button
                            onClick={() => setEditingStep(index)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:border-[var(--accent)] transition cursor-pointer flex-shrink-0"
                          >
                            ✏️ 编辑
                          </button>
                          <button
                            onClick={() => removeStep(index)}
                            className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-500/10 transition cursor-pointer flex-shrink-0"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Hint */}
          {localSteps.length > 1 && (
            <div className="flex justify-center mt-4">
              <p className="text-xs text-[var(--text-muted)]">
                ↓ 拖拽把手 ⋮⋮ 调整顺序 ↓
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
          <div className="text-sm text-[var(--text-muted)]">
            共 {localSteps.length} 个步骤
            {localSteps.some((s) => s.type === "review") && (
              <span className="ml-2 text-orange-400">
                ·{" "}
                {
                  localSteps.filter(
                    (s) => s.type === "review" && !s.feedbackAgentId
                  ).length
                }{" "}
                个审核步骤未设置不通过反馈
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--bg)] transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-bold hover:opacity-90 transition"
            >
              💾 保存工作流
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
