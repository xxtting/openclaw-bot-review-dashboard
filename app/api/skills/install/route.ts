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

    // 实际应该调用 ClawHub CLI 来安装技能
    // 这里模拟成功响应
    console.log(`Installing skill: ${skillId}`);

    return NextResponse.json({
      success: true,
      message: "技能安装成功",
    });
  } catch (error) {
    console.error("Install skill error:", error);
    return NextResponse.json(
      { error: "技能安装失败" },
      { status: 500 }
    );
  }
}
