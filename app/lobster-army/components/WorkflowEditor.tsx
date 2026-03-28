"use client";

import { useState, useRef, useCallback, DragEvent } from "react";

interface WorkflowStep {
  id: string;
  name: string;
  type: "execute" | "review" | "deploy" | "test" | "archive";
  assigneeId?: string;
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
];

export default function WorkflowEditor({ steps, agents, onSave, onClose }: WorkflowEditorProps) {
  const [localSteps, setLocalSteps] = useState<WorkflowStep[]>(steps);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  // 添加新步骤
  const addStep = (type: string) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: STEP_TYPES.find(t => t.type === type)?.name || "新步骤",
      type: type as any,
    };
    setLocalSteps([...localSteps, newStep]);
  };

  // 删除步骤
  const removeStep = (index: number) => {
    setLocalSteps(localSteps.filter((_, i) => i !== index));
  };

  // 更新步骤
  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setLocalSteps(localSteps.map((step, i) => i === index ? { ...step, ...updates } : step));
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
    // 重新编号
    const numberedSteps = localSteps.map((step, idx) => ({
      ...step,
      id: `step-${idx + 1}`,
    }));
    onSave(numberedSteps);
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
            <p className="text-xs text-[var(--text-muted)] mt-1">拖拽排序步骤，分配负责Agent</p>
          </div>
          <button onClick={onClose} className="text-2xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
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
              <p className="text-xs text-[var(--text-muted)] mt-2">点击上方按钮添加步骤</p>
            </div>
          ) : (
            <div className="space-y-3">
              {localSteps.map((step, index) => {
                const stepType = STEP_TYPES.find(t => t.type === step.type) || STEP_TYPES[0];
                const isDragging = draggedIndex === index;
                const isEditing = editingStep === index;
                const assignedAgent = agents.find(a => a.id === step.assigneeId);

                return (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      isDragging 
                        ? "border-[var(--accent)] opacity-50 bg-[var(--accent)]/10" 
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {/* Drag Handle */}
                    <div className="text-[var(--text-muted)] cursor-grab active:cursor-grabbing">
                      ⋮⋮
                    </div>

                    {/* Step Number */}
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: stepType.color }}
                    >
                      {index + 1}
                    </div>

                    {/* Step Info or Edit */}
                    {isEditing ? (
                      <div className="flex-1 flex gap-3 items-center">
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(index, { name: e.target.value })}
                          className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                          placeholder="步骤名称"
                          autoFocus
                        />
                        <select
                          value={step.type}
                          onChange={(e) => updateStep(index, { type: e.target.value as any })}
                          className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                        >
                          {STEP_TYPES.map((st) => (
                            <option key={st.type} value={st.type}>{st.icon} {st.name}</option>
                          ))}
                        </select>
                        <select
                          value={step.assigneeId || ""}
                          onChange={(e) => updateStep(index, { assigneeId: e.target.value || undefined })}
                          className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                        >
                          <option value="">选择Agent...</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditingStep(null)}
                          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-bold hover:opacity-90"
                        >
                          ✓ 确认
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Step Details */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{stepType.icon}</span>
                            <span className="font-medium">{step.name}</span>
                            <span 
                              className="px-2 py-0.5 rounded text-xs text-white"
                              style={{ backgroundColor: stepType.color }}
                            >
                              {stepType.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                            {assignedAgent ? (
                              <span>{assignedAgent.emoji} {assignedAgent.name}</span>
                            ) : (
                              <span className="text-orange-400">⚠️ 未分配Agent</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <button
                          onClick={() => setEditingStep(index)}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:border-[var(--accent)] transition cursor-pointer"
                        >
                          ✏️ 编辑
                        </button>
                        <button
                          onClick={() => removeStep(index)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-500/10 transition cursor-pointer"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Arrow indicators between steps */}
          {localSteps.length > 1 && (
            <div className="flex justify-center mt-2">
              <p className="text-xs text-[var(--text-muted)]">↓ 拖拽上方把手调整顺序 ↓</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
          <div className="text-sm text-[var(--text-muted)]">
            共 {localSteps.length} 个步骤
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
