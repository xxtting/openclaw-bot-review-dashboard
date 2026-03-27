"use client";

import { useState } from "react";
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

// 固定的热门技能列表 - 首页直接展示，不调用API
const POPULAR_SKILLS: Skill[] = [
  {
    id: "ai-news-collectors",
    name: "AI News Collectors",
    description: "聚合全球AI领域最新新闻与资讯，自动追踪OpenAI、Google DeepMind、Anthropic等头部AI公司动态",
    author: "clawhub",
    version: "1.0.0",
    category: "extension",
    installed: false,
    rating: 4.8,
    downloads: 12500,
    tags: ["ai", "news", "aggregator", "openai", "deepmind"],
  },
  {
    id: "humanizer",
    name: "Humanizer",
    description: "将AI生成的文本转换为自然、人性化的写作风格，消除AI写作痕迹，提升内容真实感",
    author: "clawhub",
    version: "1.2.0",
    category: "extension",
    installed: false,
    rating: 4.7,
    downloads: 8900,
    tags: ["writing", "nlp", "humanize", "content"],
  },
  {
    id: "weather",
    name: "Weather",
    description: "提供全球城市天气预报，支持当前天气、温度、湿度、风速及未来7天预报，无需API密钥",
    author: "clawhub",
    version: "1.0.0",
    category: "builtin",
    installed: false,
    rating: 4.9,
    downloads: 45600,
    tags: ["weather", "forecast", "wttr", "meteo"],
  },
  {
    id: "pdf-tools",
    name: "PDF Tools",
    description: "强大的PDF处理工具集，支持PDF合并、拆分、提取文本和图片、压缩、加密解密等操作",
    author: "clawhub",
    version: "2.1.0",
    category: "extension",
    installed: false,
    rating: 4.6,
    downloads: 6700,
    tags: ["pdf", "document", "tools", "converter"],
  },
  {
    id: "todoist",
    name: "Todoist",
    description: "与Todoist任务管理应用深度集成，支持创建任务、设置截止日期、添加标签、查看项目",
    author: "clawhub",
    version: "1.5.0",
    category: "extension",
    installed: false,
    rating: 4.5,
    downloads: 5400,
    tags: ["todoist", "tasks", "productivity", "integration"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHub集成工具，支持查看仓库、Issues、PRs，创建Issue，提交评论，触发CI等操作",
    author: "clawhub",
    version: "2.0.0",
    category: "builtin",
    installed: false,
    rating: 4.8,
    downloads: 32100,
    tags: ["github", "git", "repo", "ci", "issues"],
  },
  {
    id: "feishu-doc",
    name: "Feishu Doc",
    description: "飞书文档深度集成，支持读取、创建、编辑云文档，插入表格和图片，管理文档权限",
    author: "clawhub",
    version: "1.8.0",
    category: "builtin",
    installed: false,
    rating: 4.9,
    downloads: 28900,
    tags: ["feishu", "lark", "doc", "document", "云文档"],
  },
  {
    id: "video-frames",
    name: "Video Frames",
    description: "从视频中提取帧画面，支持指定时间点或间隔提取，可用于缩略图生成、视频分析",
    author: "clawhub",
    version: "1.1.0",
    category: "extension",
    installed: false,
    rating: 4.4,
    downloads: 4100,
    tags: ["video", "frames", "ffmpeg", "thumbnail"],
  },
  {
    id: "openai-whisper",
    name: "OpenAI Whisper",
    description: "基于OpenAI Whisper的语音转文字工具，支持音频文件转录，多语言识别，高准确率",
    author: "clawhub",
    version: "1.3.0",
    category: "extension",
    installed: false,
    rating: 4.7,
    downloads: 7200,
    tags: ["whisper", "speech", "audio", "transcribe", "openai"],
  },
  {
    id: "clawhub",
    name: "ClawHub",
    description: "技能商店管理工具，搜索、安装、更新、发布OpenClaw技能，管理本地技能库",
    author: "clawhub",
    version: "1.0.0",
    category: "builtin",
    installed: false,
    rating: 4.9,
    downloads: 58200,
    tags: ["skill", "clawhub", "store", "manage"],
  },
  {
    id: "find",
    name: "Find",
    description: "强大的文件搜索工具，支持按文件名、扩展名、路径模式、内容关键词等条件快速定位文件",
    author: "clawhub",
    version: "1.0.0",
    category: "extension",
    installed: false,
    rating: 4.6,
    downloads: 9800,
    tags: ["find", "file", "search", "fs", "tool"],
  },
  {
    id: "ontology",
    name: "Ontology",
    description: "知识图谱构建工具，帮助构建实体关系网络，支持知识抽取、本体建模和语义推理",
    author: "clawhub",
    version: "1.1.0",
    category: "extension",
    installed: false,
    rating: 4.4,
    downloads: 3200,
    tags: ["knowledge", "graph", "ontology", "ai", "rdf"],
  },
  {
    id: "self-improving-agent",
    name: "Self-Improving + Proactive Agent",
    description: "自我改进型主动Agent，能从交互中学习优化策略，主动预测用户需求并提前行动",
    author: "clawhub",
    version: "2.0.0",
    category: "extension",
    installed: false,
    rating: 4.7,
    downloads: 15600,
    tags: ["agent", "ai", "self-improve", "proactive", "learning"],
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description: "Obsidian笔记软件集成，支持双向链接、图谱视图、模板创建和知识库管理",
    author: "clawhub",
    version: "1.3.0",
    category: "extension",
    installed: false,
    rating: 4.8,
    downloads: 21300,
    tags: ["obsidian", "note", "markdown", "knowledge", "vault"],
  },
  {
    id: "agent-browser-clawdbot",
    name: "Agent Browser ClawDBot",
    description: "浏览器自动化Agent工具，支持网页浏览、内容提取、表单填写和批量操作",
    author: "clawhub",
    version: "1.5.0",
    category: "extension",
    installed: false,
    rating: 4.5,
    downloads: 7800,
    tags: ["browser", "automation", "agent", "scrape", "web"],
  },
  {
    id: "baidu-search",
    name: "Baidu Search",
    description: "百度搜索集成，支持关键词搜索、新闻检索、图片搜索和百度百科查询",
    author: "clawhub",
    version: "1.2.0",
    category: "extension",
    installed: false,
    rating: 4.3,
    downloads: 6400,
    tags: ["baidu", "search", "china", "web", "api"],
  },
  {
    id: "mcporter",
    name: "Mcporter",
    description: "Minecraft服务器管理助手，支持服务器状态监控、玩家管理、命令执行和日志分析",
    author: "clawhub",
    version: "1.0.0",
    category: "extension",
    installed: false,
    rating: 4.2,
    downloads: 4100,
    tags: ["minecraft", "server", "game", "manage", "java"],
  },
  {
    id: "clawdhub",
    name: "ClawdHub",
    description: "ClawHub社区版技能市场，汇集开发者贡献的各类实用技能和工具扩展",
    author: "clawhub",
    version: "1.0.0",
    category: "extension",
    installed: false,
    rating: 4.6,
    downloads: 8900,
    tags: ["clawhub", "community", "skill", "store", "hub"],
  },
];

interface SkillStoreData {
  skills: Skill[];
  categories: string[];
}

export default function SkillStorePage() {
  const { t } = useI18n();
  // 首页直接使用热门技能，不加载状态
  const [data, setData] = useState<SkillStoreData>({
    skills: POPULAR_SKILLS,
    categories: ["builtin", "extension", "custom"],
  });
  const [searchResults, setSearchResults] = useState<Skill[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "builtin" | "extension" | "custom">("all");
  const [installing, setInstalling] = useState<Record<string, boolean>>({});

  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/skills/store?q=${encodeURIComponent(query)}`);
      const result = await response.json();

      if (result.error) {
        setSearchError(result.error);
        return;
      }

      const skills: Skill[] = (result.skills || []).map((s: any) => ({
        id: s.slug || s.id,
        name: s.name,
        description: s.description || "",
        author: s.author || "unknown",
        version: s.version || "1.0.0",
        category: s.category || "extension",
        installed: s.installed || false,
        rating: s.rating || 4.0,
        downloads: s.downloads || 0,
        tags: s.tags || [],
      }));

      setSearchResults(skills);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t("common.loadError"));
    } finally {
      setSearching(false);
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

      // 更新本地状态（热门技能 + 搜索结果）
      setData((prev) => ({
        ...prev,
        skills: prev.skills.map((s) =>
          s.id === skillId ? { ...s, installed: true } : s
        ),
      }));
      setSearchResults((prev) =>
        prev ? prev.map((s) => (s.id === skillId ? { ...s, installed: true } : s)) : null
      );

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

      // 更新本地状态（热门技能 + 搜索结果）
      setData((prev) => ({
        ...prev,
        skills: prev.skills.map((s) =>
          s.id === skillId ? { ...s, installed: false } : s
        ),
      }));
      setSearchResults((prev) =>
        prev ? prev.map((s) => (s.id === skillId ? { ...s, installed: false } : s)) : null
      );

      alert(t("skillStore.uninstallSuccess"));
    } catch (err) {
      alert(t("skillStore.uninstallFailed"));
    } finally {
      setInstalling((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  // 搜索时过滤热门技能（客户端过滤）
  const popularFiltered = data.skills.filter((skill) => {
    if (filter !== "all" && skill.category !== filter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  // 显示搜索结果或首页热门技能
  const displaySkills = searchResults ?? popularFiltered;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSearchResults(searchQuery);
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val) {
      setSearchResults(null);
      setSearchError(null);
    }
  };

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

      {/* 搜索框 - 用户主动搜索才调用API */}
      <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder={t("skillStore.search")}
            className="w-full px-4 py-2.5 pl-10 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            🔍
          </span>
        </div>

        {/* 首页筛选按钮 */}
        {!searchResults && (
          <div className="flex gap-2">
            {(["all", "builtin", "extension", "custom"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
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
        )}
      </form>

      {/* 搜索提示 */}
      {searching && (
        <div className="text-center py-4">
          <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
        </div>
      )}

      {searchError && (
        <div className="text-center py-4">
          <p className="text-red-400">{t("common.loadError")}: {searchError}</p>
        </div>
      )}

      {/* 搜索结果提示 */}
      {searchResults && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-[var(--text-muted)]">
            搜索 "{searchQuery}" 找到 {searchResults.length} 个结果
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchResults(null);
            }}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            清除搜索
          </button>
        </div>
      )}

      {/* 技能列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displaySkills.map((skill) => (
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

      {displaySkills.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)] text-lg">{t("skillStore.noResults")}</p>
        </div>
      )}
    </main>
  );
}
