import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, verifyJWTToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session-token")?.value;
    const jwtToken = cookieStore.get("auth-jwt")?.value;

    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    // 验证 Session
    const session = verifySession(token);
    if (!session) {
      // Session 不存在或已过期，清除 Cookie
      clearAuthCookies(cookieStore);
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    // 验证 JWT
    let jwtPayload = null;
    if (jwtToken) {
      jwtPayload = await verifyJWTToken(jwtToken);
    }

    return NextResponse.json({
      authenticated: true,
      expiresAt: session.expiresAt,
      role: jwtPayload?.role || "admin",
    });
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json(
      { error: "验证失败", authenticated: false },
      { status: 500 }
    );
  }
}

function clearAuthCookies(cookieStore: any) {
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
}
