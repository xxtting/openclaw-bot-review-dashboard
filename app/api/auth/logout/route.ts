import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session-token")?.value;

    if (token) {
      // 销毁 Session
      destroySession(token);
    }

    // 清除所有认证相关的 Cookie
    cookieStore.set("session-token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    cookieStore.set("auth-jwt", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      message: "已退出登录",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "退出登录失败" },
      { status: 500 }
    );
  }
}
