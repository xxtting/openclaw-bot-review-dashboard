import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cleanupExpiredSessions, verifyPassword, hashPassword, getAdminPassword, createSession, generateJWTToken } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "密码不能为空" },
        { status: 400 }
      );
    }

    // 清理过期会话
    cleanupExpiredSessions();

    // 获取管理员密码
    const adminPassword = getAdminPassword();

    // 检查是否是哈希值（第一次设置密码）
    const isHashed = adminPassword.startsWith("$2") || adminPassword.startsWith("$2a") || adminPassword.startsWith("$2b");

    if (isHashed) {
      // 使用 bcrypt 验证
      const isValid = await verifyPassword(password, adminPassword);
      if (!isValid) {
        return NextResponse.json(
          { error: "密码错误" },
          { status: 401 }
        );
      }
    } else {
      // 简单比较（用于开发环境或首次设置）
      if (password !== adminPassword) {
        return NextResponse.json(
          { error: "密码错误" },
          { status: 401 }
        );
      }
    }

    // 生成 Session Token（有效期7天）
    const token = createSession(7 * 24 * 60 * 60 * 1000);

    // 生成 JWT Token
    const jwtToken = await generateJWTToken(
      { authenticated: true, role: "admin" },
    );

    // 设置 Cookie
    const cookieStore = await cookies();
    cookieStore.set("session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7天
      path: "/",
    });

    // 设置 JWT Cookie（用于客户端验证）
    cookieStore.set("auth-jwt", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7天
      path: "/",
    });

    return NextResponse.json({
      success: true,
      message: "登录成功",
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "登录失败" },
      { status: 500 }
    );
  }
}

/**
 * 设置管理员密码（首次设置）
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, confirmPassword } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "密码不能为空" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少6位" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "两次输入的密码不一致" },
        { status: 400 }
      );
    }

    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 在实际项目中，这里应该将哈希后的密码保存到数据库或配置文件
    // 目前我们只能通过环境变量来设置
    // 返回哈希后的密码，用户需要手动设置到环境变量或配置文件中
    return NextResponse.json({
    });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json(
      { error: "设置密码失败" },
      { status: 500 }
    );
  }
}
