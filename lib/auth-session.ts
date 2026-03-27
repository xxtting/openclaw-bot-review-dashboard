/**
 * 认证会话管理
 * 
 * 注意：这是内存存储，适合开发环境。
 * 生产环境应该使用 Redis 或数据库。
 */

interface Session可以通过 {
  createdAt: number;
  expiresAt: number;
}

// Session 存储
const sessions = new Map<string, Session可以通过>();

/**
 * 生成 Session Token
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 创建 Session
 */
export function createSession(expiresInMs: number = 7 * 24 * 60 * 60 * 1000): string {
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + expiresInMs;

  sessions.set(token, { createdAt: now, expiresAt });

  return token;
}

/**
 * 验证 Session
 */
export function verifySession(token: string): Session可以通过 | null {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  // 检查是否过期
  const now = Date.now();
  if (now > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

/**
 * 销毁 Session
 */
export function destroySession(token: string): boolean {
  return sessions.delete(token);
}

/**
 * 清理过期会话
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}

/**
 * 获取所有活跃会话数
 */
export function getActiveSessionCount(): number {
  return sessions.size;
}

/**
 * 验证密码（从环境变量或默认密码）
 */
export function getAdminPassword(): string {
  // 优先从环境变量读取
  const envPassword = process.env.OPENCLAW_ADMIN_PASSWORD;
  if (envPassword) {
    return envPassword;
  }

  // 默认密码（实际部署时应通过环境变量设置）
  return "openclaw123";
}

/**
 * 使用 bcryptjs 验证密码
 */
export async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(input, storedHash);
}

/**
 * 使用 bcryptjs 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, 10);
}

/**
 * 生成 JWT Token（使用 jose）
 */
export async function generateJWTToken(payload: Record<string, any>, expiresIn: string = "7d"): Promise<string> {
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || "openclaw-jwt-secret-change-in-production"
  );

  // 解析过期时间
  let expTime: number;
  if (expiresIn.endsWith('d')) {
    // 天：7d -> 7 * 24 * 60 * 60
    const days = parseInt(expiresIn.slice(0, -1));
    expTime = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  } else if (expiresIn.endsWith('h')) {
    // 小时：24h -> 24 * 60 * 60
    const hours = parseInt(expiresIn.slice(0, -1));
    expTime = Math.floor(Date.now() / 1000) + hours * 60 * 60;
  } else if (expiresIn.endsWith('m')) {
    // 分钟：30m -> 30 * 60
    const minutes = parseInt(expiresIn.slice(0, -1));
    expTime = Math.floor(Date.now() / 1000) + minutes * 60;
  } else if (expiresIn.endsWith('s')) {
    // 秒：60s -> 60
    const seconds = parseInt(expiresIn.slice(0, -1));
    expTime = Math.floor(Date.now() / 1000) + seconds;
  } else {
    // 默认 7 天
    expTime = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  }

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expTime)
    .sign(secret);

  return jwt;
}

/**
 * 验证 JWT Token（使用 jose）
 */
export async function verifyJWTToken(token: string): Promise<Record<string, any> | null> {
  try {
    const { jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "openclaw-jwt-secret-change-in-production"
    );

    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, any>;
  } catch (error) {
    console.error("JWT verify error:", error);
    return null;
  }
}
