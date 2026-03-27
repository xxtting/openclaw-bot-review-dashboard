import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillId } = body;

    if (!skillId) {
      return NextResponse.json({ error: "缺少技能ID" }, { status: 400 });
    }

    // Install into OPENCLAW_HOME/skills using clawhub CLI
    // --workdir: set to OPENCLAW_HOME
    // --dir: skills (relative to workdir)
    try {
      const result = execSync(
        `clawhub install ${skillId} --workdir "${OPENCLAW_HOME}" --dir skills --no-input 2>&1`,
        {
          encoding: "utf8",
          timeout: 60000,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      return NextResponse.json({
        success: true,
        message: "技能安装成功",
        output: result.trim(),
      });
    } catch (installErr: any) {
      const stderr = installErr.stderr || installErr.message || "";
      const stdout = installErr.stdout || "";
      const combined = stderr + stdout;
      // Already installed / already exists (both EN and CN)
      if (
        combined.includes("Already installed") ||
        combined.includes("already exists") ||
        combined.includes("已存在") ||
        combined.includes("目录已存在")
      ) {
        return NextResponse.json({
          success: true,
          message: "技能已安装",
          output: combined.trim(),
        });
      }
      return NextResponse.json(
        { error: `安装失败: ${stderr.slice(0, 300)}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Install skill error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
