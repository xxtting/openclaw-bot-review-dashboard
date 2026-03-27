import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// Simple in-memory cache (resets on server restart)
let cache: { skills: unknown[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface SkillEntry {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: "builtin" | "extension" | "custom";
  installed: boolean;
  rating: number;
  downloads: number;
  tags: string[];
}

function getInstalledSkillIds(): Set<string> {
  const skillsDir = path.join(OPENCLAW_HOME, "skills");
  const installed = new Set<string>();
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      const skillDir = path.join(skillsDir, name);
      try {
        if (fs.statSync(skillDir).isDirectory()) installed.add(name);
      } catch { /* ignore */ }
    }
  }
  return installed;
}

function searchSkills(query: string, limit = 8): Array<{ slug: string; name: string; score: number }> {
  try {
    const raw = execSync(`clawhub search "${query}" --limit ${limit} 2>&1`, {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const results: Array<{ slug: string; name: string; score: number }> = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("-") || trimmed.startsWith("Searching")) continue;
      const match = trimmed.match(/^(.+?)\s{2,}(.+?)\s{2,}\((\d+\.\d+)\)$/);
      if (match) {
        results.push({
          slug: match[1].trim(),
          name: match[2].trim(),
          score: parseFloat(match[3]),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

function inspectSkill(slug: string): Partial<SkillEntry> {
  try {
    const out = execSync(`clawhub inspect ${slug} 2>&1`, {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = out.split("\n");
    const result: Record<string, string> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        if (val) result[key] = val;
      }
    }
    const firstLine = lines[0]?.trim() || "";
    const nameParts = firstLine.split(/\s{2,}/);
    const parsedName = nameParts.length > 1 ? nameParts[1] : slug;
    return {
      name: parsedName,
      description: result.summary || "",
      author: result.owner || "unknown",
      version: result.latest || result.version || "1.0.0",
      tags: result.tags ? result.tags.split(",").map((t) => t.trim()) : [],
    };
  } catch {
    return { name: slug, description: "", author: "unknown", version: "1.0.0", tags: [] };
  }
}

async function searchSkillsAsync(query: string, limit = 8): Promise<Array<{ slug: string; name: string; score: number }>> {
  try {
    const { stdout } = await execAsync(
      `clawhub search "${query}" --limit ${limit} 2>&1`,
      { timeout: 10000 }
    );
    const results: Array<{ slug: string; name: string; score: number }> = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("-") || trimmed.startsWith("Searching")) continue;
      const match = trimmed.match(/^(.+?)\s{2,}(.+?)\s{2,}\((\d+\.\d+)\)$/);
      if (match) {
        results.push({
          slug: match[1].trim(),
          name: match[2].trim(),
          score: parseFloat(match[3]),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

const POPULAR_QUERIES = [
  "github", "health", "weather", "slack", "discord", "notion",
  "video", "canvas", "cron", "memory", "skill", "agent", "code",
  "data", "web", "api", "search", "file",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  try {
    const installedIds = getInstalledSkillIds();
    const skills: SkillEntry[] = [];
    const seen = new Set<string>();

    const addSkill = (slug: string, name: string, score: number) => {
      if (seen.has(slug)) return;
      seen.add(slug);
      const meta = inspectSkill(slug);
      skills.push({
        slug,
        name: meta.name || name,
        description: meta.description || "",
        author: meta.author || "unknown",
        version: meta.version || "1.0.0",
        category: installedIds.has(slug) ? "custom" : "extension",
        installed: installedIds.has(slug),
        rating: Math.round(score * 20) / 20 || 4.0,
        downloads: 0,
        tags: meta.tags || [],
      });
    };

    if (query) {
      const results = searchSkills(query, 30);
      for (const r of results) {
        addSkill(r.slug, r.name, r.score);
      }
    } else {
      // Return cached top skills if available
      if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return NextResponse.json({
          skills: cache.skills,
          categories: ["builtin", "extension", "custom"],
        });
      }

      // Fetch top skills from multiple queries in parallel
      const allResults = await Promise.all(
        POPULAR_QUERIES.map((q) => searchSkillsAsync(q, 6))
      );

      for (const results of allResults) {
        for (const r of results) {
          addSkill(r.slug, r.name, r.score);
        }
      }

      skills.sort((a, b) => b.rating - a.rating);
      const topSkills = skills.slice(0, 6);

      // Cache result
      cache = { skills: topSkills, timestamp: Date.now() };

      return NextResponse.json({
        skills: topSkills,
        categories: ["builtin", "extension", "custom"],
      });
    }

    return NextResponse.json({
      skills,
      categories: ["builtin", "extension", "custom"],
    });
  } catch (error: any) {
    console.error("Skills store error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
