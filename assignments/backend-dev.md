# 后端工程师任务分配

**角色**: 后端工程师 (核芯)
**负责人**: backend-dev agent
**任务类型**: API 开发

---

## 🎯 核心任务

### 1. 🔴 P0: 登录认证 API

**目标**: 实现安全可靠的登录认证系统

**文件**:
- `app/api/auth/login/route.ts` - 登录接口
- `app/api/auth/logout/route.ts` - 登出接口
- `app/api/auth/session/route.ts` - Session 查询接口
- `middleware.ts` - 路由保护中间件
- `lib/auth-session.ts` - Session 管理工具

**任务清单**:
- [ ] 安装依赖（如需要）
  ```bash
  npm install next-auth  # 或 jose 等 JWT 库
  ```
- [ ] 实现 Session 管理
  - [ ] 创建 session
  - [ ] 验证 session
  - [ ] 销毁 session
  - [ ] Session 过期处理
- [ ] 实现登录接口
  - [ ] 接收用户名/密码
  - [ ] 验证凭据
  - [ ] 创建 session
  - [ ] 返回认证信息
- [ ] 实现登出接口
  - [ ] 清除 session
  - [ ] 重定向到登录页
- [ ] 实现 Session 查询接口
  - [ ] 返回当前用户信息
  - [ ] 未登录返回 401
- [ ] 实现路由保护中间件
  - [ ] 检查 session
  - [ ] 未登录重定向到登录页
  - [ ] 保护 `/app/*` 路由
- [ ] 添加环境变量配置
  ```env
  AUTH_SECRET=your-secret-key
  AUTH_URL=http://localhost:3000
  ```
- [ ] 错误处理
  - [ ] 无效凭据
  - [ ] Session 过期
  - [ ] 服务器错误

**依赖**: 等待 architect 完成架构设计

---

### 2. 🟡 P1: 技能商店 API

**目标**: 提供技能列表、安装、卸载功能

**文件**:
- `app/api/skills/store/list/route.ts` - 获取技能列表
- `app/api/skills/store/detail/route.ts` - 技能详情
- `app/api/skills/install/route.ts` - 安装技能
- `app/api/skills/uninstall/route.ts` - 卸载技能

**任务清单**:
- [ ] 获取技能列表
  - [ ] 从 ClawHub API 获取
  - [ ] 缓存机制
  - [ ] 分页支持
- [ ] 获取技能详情
  - [ ] 根据 ID 查询
  - [ ] 返回技能信息
- [ ] 安装技能
  - [ ] 验证技能来源
  - [ ] 下载/克隆技能
  - [ ] 安装到系统
  - [ ] 返回安装结果
- [ ] 卸载技能
  - [ ] 验证技能已安装
  - [ ] 清理文件
  - [ ] 返回卸载结果
- [ ] 错误处理
  - [ ] 网络错误
  - [ ] 无效技能 ID
  - [ ] 权限错误

---

## 📋 当前优先级

**P0**:
1. 登录认证 API（等待 architect 架构设计完成）

**P1**:
2. 技能商店 API

---

## 🔔 重要提示

1. **等待架构**: 登录认证功能必须等 architect 完成架构设计
2. **接口规范**: 严格遵循 architect 制定的接口规范
3. **安全性**: 所有接口必须考虑安全性和错误处理
4. **日志**: 添加必要的日志记录

---

**开始时间**: 立即（P1 任务可先开始，P0 等待架构）
**预计完成**: 登录认证 4-6 小时，技能商店 3-4 小时
