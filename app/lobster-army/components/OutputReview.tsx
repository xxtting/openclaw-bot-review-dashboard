"use client";

import { useState, useEffect, useCallback } from "react";

interface OutputValidation {
  lengthCheck: number;
  minRequired: number;
  codeBlocks?: number;
  links?: number;
  lines?: number;
}

interface StepOutput {
  id: string;
  taskId: string;
  stepIndex: number;
  stepId: string;
  stepName: string;
  agentId: string;
  agentName?: string;
  content: string;
  attachments?: string[];
  validationStatus: "pending" | "valid" | "invalid" | "empty";
  validationMessage?: string;
  validationDetails?: OutputValidation;
  reviewStatus: "pending" | "approved" | "rejected" | "needs_revision";
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  history?: OutputHistoryEntry[];
}

interface OutputHistoryEntry {
  timestamp: string;
  action: string;
  actor: string;
  previousContent?: string;
  newContent?: string;
  note?: string;
}

interface OutputReviewProps {
  taskId: string;
  onClose?: () => void;
}

export default function OutputReview({ taskId, onClose }: OutputReviewProps) {
  const [outputs, setOutputs] = useState<StepOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<StepOutput | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const fetchOutputs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ taskId, includeHistory: "true" });
      if (activeTab === "approved") params.set("reviewStatus", "approved");
      else if (activeTab === "rejected") params.set("reviewStatus", "rejected");
      else if (activeTab === "pending") params.set("reviewStatus", "pending");
      
      const res = await fetch(`/api/lobster-army/output?${params}`);
      if (!res.ok) throw new Error("获取产出失败");
      const data = await res.json();
      setOutputs(data.outputs || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [taskId, activeTab]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  const handleReview = async (outputId: string, action: "approve" | "reject" | "request_revision") => {
    if (reviewing) return;
    try {
      setReviewing(true);
      const res = await fetch("/api/lobster-army/output", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputId,
          action,
          note: reviewNote,
          reviewedBy: "human"
        })
      });
      if (!res.ok) throw new Error("审核操作失败");
      setReviewNote("");
      setSelectedOutput(null);
      await fetchOutputs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReviewing(false);
    }
  };

  const validationBadge = (status: StepOutput["validationStatus"]) => {
    switch (status) {
      case "valid":
        return <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">✅ 有效</span>;
      case "invalid":
        return <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">❌ 无效</span>;
      case "empty":
        return <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">⬜ 空</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700">⏳ 待验证</span>;
    }
  };

  const reviewBadge = (status: StepOutput["reviewStatus"]) => {
    switch (status) {
      case "approved":
        return <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">通过</span>;
      case "rejected":
        return <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">拒绝</span>;
      case "needs_revision":
        return <span className="px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700">需修正</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">待审核</span>;
    }
  };

  const getValidationStats = () => {
    const valid = outputs.filter(o => o.validationStatus === "valid").length;
    const invalid = outputs.filter(o => o.validationStatus === "invalid").length;
    const pending = outputs.filter(o => o.validationStatus === "pending" || o.validationStatus === "empty").length;
    return { valid, invalid, pending, total: outputs.length };
  };

  const stats = getValidationStats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-50 to-red-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">🦞 产出审核面板</h2>
            <p className="text-sm text-gray-500 mt-0.5">任务ID: {taskId}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-green-100 text-green-700">✅ {stats.valid} 有效</span>
              <span className="px-2 py-1 rounded bg-red-100 text-red-700">❌ {stats.invalid} 无效</span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-500">⏳ {stats.pending} 待审</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b flex gap-1">
          {(["all", "pending", "approved", "rejected"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "all" ? "全部" : tab === "pending" ? "待审核" : tab === "approved" ? "已通过" : "已拒绝"}
              <span className="ml-1 text-xs opacity-60">
                ({tab === "all" ? outputs.length : outputs.filter(o => o.reviewStatus === (tab as StepOutput["reviewStatus"])).length})
              </span>
            </button>
          ))}
          <button
            onClick={fetchOutputs}
            className="ml-auto px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            title="刷新"
          >
            🔄
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* 左侧：产出列表 */}
          <div className="w-80 border-r overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-32 text-gray-400">加载中...</div>
            )}
            {!loading && outputs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                <span className="text-2xl">📭</span>
                <span className="text-sm">暂无产出记录</span>
              </div>
            )}
            {!loading && outputs.map(output => (
              <div
                key={output.id}
                onClick={() => setSelectedOutput(output)}
                className={`px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedOutput?.id === output.id ? "bg-orange-50 border-l-4 border-l-orange-400" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-800">{output.stepName}</span>
                  {validationBadge(output.validationStatus)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Agent: {output.agentId}</span>
                  {reviewBadge(output.reviewStatus)}
                </div>
                {output.validationDetails && (
                  <div className="mt-1 text-xs text-gray-400">
                    {output.validationDetails.lengthCheck}字节 · {output.validationDetails.lines}行
                    {output.validationDetails.codeBlocks ? ` · ${output.validationDetails.codeBlocks}代码块` : ""}
                  </div>
                )}
                <div className="text-xs text-gray-300 mt-0.5">
                  {new Date(output.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
            ))}
          </div>

          {/* 右侧：产出详情 */}
          <div className="flex-1 overflow-y-auto">
            {!selectedOutput && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                <span className="text-4xl">👈</span>
                <span className="text-sm">请选择一个产出进行查看</span>
              </div>
            )}
            {selectedOutput && (
              <div className="p-6">
                {/* 产出元信息 */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{selectedOutput.stepName}</h3>
                    <div className="flex gap-3 mt-1 text-sm text-gray-500">
                      <span>Agent: <strong>{selectedOutput.agentId}</strong></span>
                      <span>步骤: <strong>#{selectedOutput.stepIndex + 1}</strong></span>
                      <span>耗时: <strong>{selectedOutput.validationDetails?.lengthCheck || 0}ms</strong></span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {validationBadge(selectedOutput.validationStatus)}
                    {reviewBadge(selectedOutput.reviewStatus)}
                  </div>
                </div>

                {/* 验证详情 */}
                {selectedOutput.validationDetails && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs font-medium text-gray-500 mb-2">📊 验证详情</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>内容长度: <strong>{selectedOutput.validationDetails.lengthCheck}</strong> 字节</div>
                      <div>最低要求: <strong>{selectedOutput.validationDetails.minRequired}</strong> 字节</div>
                      <div>总行数: <strong>{selectedOutput.validationDetails.lines || 0}</strong> 行</div>
                      <div>代码块: <strong>{selectedOutput.validationDetails.codeBlocks || 0}</strong> 个</div>
                    </div>
                    {selectedOutput.validationMessage && (
                      <div className={`mt-2 text-xs ${selectedOutput.validationStatus === "valid" ? "text-green-600" : "text-red-600"}`}>
                        {selectedOutput.validationMessage}
                      </div>
                    )}
                  </div>
                )}

                {/* 审核备注（如果已有） */}
                {selectedOutput.reviewNote && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                    <div className="text-xs font-medium text-blue-600 mb-1">
                      审核备注 {selectedOutput.reviewedBy && `by ${selectedOutput.reviewedBy}`}
                      {selectedOutput.reviewedAt && ` @ ${new Date(selectedOutput.reviewedAt).toLocaleString("zh-CN")}`}
                    </div>
                    <div className="text-sm text-gray-700">{selectedOutput.reviewNote}</div>
                  </div>
                )}

                {/* 产出内容 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">📄 产出内容</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedOutput.content)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                    >
                      📋 复制
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto max-h-80 whitespace-pre-wrap font-mono">
                    {selectedOutput.content || "(无内容)"}
                  </pre>
                </div>

                {/* 历史记录 */}
                {selectedOutput.history && selectedOutput.history.length > 0 && (
                  <div className="mb-4">
                    <button
                      onClick={() => setExpandedHistory(prev => ({ ...prev, [selectedOutput.id]: !prev[selectedOutput.id] }))}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"
                    >
                      📜 历史版本
                      <span className="text-xs text-gray-400">({selectedOutput.history.length}条)</span>
                      <span className="text-xs">{expandedHistory[selectedOutput.id] ? "▲" : "▼"}</span>
                    </button>
                    {expandedHistory[selectedOutput.id] && (
                      <div className="space-y-2">
                        {selectedOutput.history.map((entry, i) => (
                          <div key={i} className="p-3 bg-gray-50 rounded text-xs">
                            <div className="flex justify-between text-gray-500 mb-1">
                              <span>{entry.action} by {entry.actor}</span>
                              <span>{new Date(entry.timestamp).toLocaleString("zh-CN")}</span>
                            </div>
                            {entry.note && <div className="text-gray-700">{entry.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 审核操作 */}
                {selectedOutput.reviewStatus === "pending" && (
                  <div className="border-t pt-4">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">审核备注</label>
                      <textarea
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="输入审核备注（可选）..."
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReview(selectedOutput.id, "approve")}
                        disabled={reviewing}
                        className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        ✅ 通过
                      </button>
                      <button
                        onClick={() => handleReview(selectedOutput.id, "request_revision")}
                        disabled={reviewing}
                        className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        🔄 要求修正
                      </button>
                      <button
                        onClick={() => handleReview(selectedOutput.id, "reject")}
                        disabled={reviewing}
                        className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        ❌ 拒绝
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-t text-sm text-red-600">
            ❌ {error}
          </div>
        )}
      </div>
    </div>
  );
}
