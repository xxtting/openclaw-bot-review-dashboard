import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 不需要认证的路由
const publicRoutes = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/verify",
  "/api/agent/inbox",
  "/api/agent/dispatch",
  "/lobster-army/api/task",
  "/lobster-army/api/data",
  "/lobster-army/api/execute",
];

// 需要认证保护的路由（除了 publicRoutes 之外的所有路由）
function isProtectedRoute(pathname: string): boolean {
  // API 路由中的 auth 相关不需要保护
  if (pathname.startsWith("/api/auth/")) {
    return false;
  }

  // 检查是否是公开路由
  if (publicRoutes.includes(pathname)) {
    return false;
  }

  // 登录页面不需要保护
  if (pathname === "/login") {
    return false;
  }

  // 其他所有路由都需要保护
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否是公开路由
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  // 检查是否有 session token
  const token = request.cookies.get("session-token")?.value;

  if (!token) {
    // 没有 token，重定向到登录页
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 有 token，继续请求
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路由，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (网站图标)
     * - 公开 API 路由
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
