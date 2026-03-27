import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillId } = body;

    if (!skillId) {
      return NextResponse.json(
        { error: "缺少技能ID" },
        { status: 400 }
      );
    }

    // 实际应该调用 ClawHub CLI 来卸载技能
    console.log(`Uninstalling skill: ${skillId}`);

    return NextResponse.json({
      success: true,
      message: "技能卸载成功",
    });
  } catch (error) {
    console.error("Uninstall skill error:", error);
    return NextResponse.json(
      { error: "技能卸载失败" },
      { status: 500 }
    );
  }
}
