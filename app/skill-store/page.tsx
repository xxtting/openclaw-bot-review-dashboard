"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: "builtin" | "extension" | "custom";
  installed: boolean;
  rating: number;
  downloads: number;
  tags: string[];
  repository?: string;
}

interface SkillStoreData {
  skills: Skill[];
  categories: string[];
}

export default function SkillStorePage() {
  const { t } = useI18n();
  const [data, setData] = useState<SkillStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "builtin" | "extension" | "custom">("all");
  const [installing, setInstalling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const response = await fetch("/api/skills/store");
      const result = await response.json();

      if (result.error) {
        setError(result.error);
        return;
      }

      // 模拟数据（实际应该从 API 获取）
      const mockSkills: Skill[] = [
        {
          id: "weather",
          name: "天气查询",
          description: "查询全球各地天气信息，支持当前位置和指定城市",
          author: "OpenClaw Team",
          version: "1.2.0",
          category: "builtin",
          installed: true,
          rating: 4.8,
          downloads: 15234,
          tags: ["天气", "查询", "工具"],
        },
        {
          id: "github",
          name: "GitHub 集成",
          description: "管理 GitHub Issues、PRs，查看 CI 状态",
          author: "OpenClaw Team",
          version: "2.0.1",
          category: "builtin",
          installed: true,
          rating: 4.9,
          downloads: 12456,
          tags: ["GitHub", "开发", "集成"],
        },
        {
          id: "feishu-doc",
          name: "飞书文档",
          description: "读写飞书文档、云文档管理",
          author: "OpenClaw Team",
          version: "1.5.0",
          category: "builtin",
          installed: true,
          rating: 4.7,
          downloads: 9876,
          tags: ["飞书", "文档", "办公"],
        },
        {
          id: "video-frames",
          name: "视频帧提取",
          description: "从视频中提取帧或短视频片段",
          author: "OpenClaw Team",
          version: "1.0.0",
          category: "extension",
          installed: false,
          rating: 4.5,
          downloads: 3421,
          tags: ["视频", "ffmpeg", "工具"],
        },
        {
          id: "clawhub",
          name: "ClawHub 技能市场",
          description: "搜索、安装、更新和发布 Agent 技能",
          author: "OpenClaw Team",
          version: "1.1.0",
          category: "extension",
          installed: false,
          rating: 4.6,
          downloads: 5678,
          tags: ["技能", "市场", "管理"],
        },
        {
          id: "healthcheck",
          name: "主机安全体检",
          description: "主机安全加固和风险容忍度配置",
          author: "OpenClaw Team",
          version: "1.3.0",
          category: "extension",
          installed: false,
          rating: 4.8,
          downloads: 2345,
          tags: ["安全", "审计", "系统"],
        },
        {
          id: "node-connect",
          name: "Node 连接诊断",
          description: "诊断 OpenClaw 节点连接和配对失败",
          author: "OpenClaw Team",
          version: "1.0.5",
          category: "extension",
          installed: false,
          rating: 4.4,
          downloads: 1876,
          tags: ["诊断", "连接", "网络"],
        },
        {
          id: "skill-creator",
          name: "技能创作者",
          description: "创建、编辑、改进或审计 AgentSkills",
          author: "OpenClaw Team",
          version: "1.2.0",
          category: "custom",
          installed: false,
          rating: 4.7,
          downloads: 4532,
          tags: ["技能", "开发", "工具"],
        },
      ];

      setData({
        skills: mockSkills,
        categories: ["builtin", "extension", "custom"],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (skillId: string) => {
    setInstalling((prev) => ({ ...prev, [skillId]: true }));
    try {
      const response = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || t("skillStore.installFailed"));
        return;
      }

      // 更新本地状态
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          skills: prev.skills.map((s) =>
            s.id === skillId ? { ...s, installed: true } : s
          ),
        };
      });

      alert(t("skillStore.installSuccess"));
    } catch (err) {
      alert(t("skillStore.installFailed"));
    } finally {
      setInstalling((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!confirm(t("skillStore.confirmUninstall"))) return;

    setInstalling((prev) => ({ ...prev, [skillId]: true }));
    try {
      const response = await fetch(`/api/skills/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || t("skillStore.uninstallFailed"));
        return;
      }

      // 更新本地状态
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          skills: prev.skills.map((s) =>
            s.id === skillId ? { ...s, installed: false } : s
          ),
        };
      });

      alert(t("skillStore.uninstallSuccess"));
    } catch (err) {
      alert(t("skillStore.uninstallFailed"));
    } finally {
      setInstalling((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  const filteredSkills = data?.skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesFilter = filter === "all" || skill.category === filter;

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("common.loadError")}: {error}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 mb-6 md:mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🛒 {t("skillStore.title")}
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {t("skillStore.subtitle")}
          </p>
        </div>
        <Link
          href="/skills"
          className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-medium hover:border-[var(--accent)] transition"
        >
          {t("skillStore.mySkills")}
        </Link>
      </div>

      {/* 搜索和筛选 */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skillStore.search")}
            className="w-full px-4 py-2.5 pl-10 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            🔍
          </span>
        </div>

        <div className="flex gap-2">
          {(["all", "builtin", "extension", "custom"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                filter === cat
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {cat === "all"
                ? t("skillStore.all")
                : cat === "builtin"
                ? t("skillStore.builtin")
                : cat === "extension"
                ? t("skillStore.extension")
                : t("skillStore.custom")}
            </button>
          ))}
        </div>
      </div>

      {/* 技能列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSkills?.map((skill) => (
          <div
            key={skill.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 flex flex-col"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{skill.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  v{skill.version} · {skill.author}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  skill.category === "builtin"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : skill.category === "extension"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                }`}
              >
                {skill.category === "builtin"
                  ? t("skillStore.builtin")
                  : skill.category === "extension"
                  ? t("skillStore.extension")
                  : t("skillStore.custom")}
              </span>
            </div>

            <p className="text-sm text-[var(--text-muted)] flex-1 mb-4 line-clamp-2">
              {skill.description}
            </p>

            <div className="flex flex-wrap gap-1 mb-4">
              {skill.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs bg-[var(--bg)] text-[var(--text-muted)]"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-4">
              <div className="flex items-center gap-1">
                <span>⭐</span>
                <span className="text-yellow-400 font-medium">{skill.rating}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>📥</span>
                <span>{skill.downloads.toLocaleString()}</span>
              </div>
            </div>

            {skill.installed ? (
              <button
                onClick={() => handleUninstall(skill.id)}
                disabled={installing[skill.id]}
                className="w-full px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-medium hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-wait transition"
              >
                {installing[skill.id] ? t("skillStore.uninstalling") : t("skillStore.uninstall")}
              </button>
            ) : (
              <button
                onClick={() => handleInstall(skill.id)}
                disabled={installing[skill.id]}
                className="w-full px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition"
              >
                {installing[skill.id] ? t("skillStore.installing") : t("skillStore.install")}
              </button>
            )}
          </div>
        ))}
      </div>

      {filteredSkills?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)] text-lg">{t("skillStore.noResults")}</p>
        </div>
      )}
    </main>
  );
}
