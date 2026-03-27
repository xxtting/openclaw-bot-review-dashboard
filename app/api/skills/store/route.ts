import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 实际应该从 ClawHub 或技能目录读取
    // 这里返回模拟数据
    return NextResponse.json({
      skills: [],
      categories: ["builtin", "extension", "custom"],
    });
  } catch (error) {
    console.error("Failed to fetch skills store:", error);
    return NextResponse.json(
      { error: "获取技能商店失败" },
      { status: 500 }
    );
  }
}
