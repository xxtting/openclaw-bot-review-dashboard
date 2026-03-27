# 团队任务启动指令

**启动人**: 凌霄 (dev-lead)
**时间**: 2026-03-27 18:30

---

## 📋 项目现状总结

### 已完成部分（代码已存在）

✅ **模型添加功能（P1）**
- 模型列表页已有「添加模型」按钮
- 添加模型表单/模态框已实现（Provider、Model ID、Name、API Key、Access Mode、Context Window、Max Tokens、Reasoning）
- 表单验证已实现
- API 调用逻辑（`/api/models/add`）
- 错误处理完善
- 大部分文本已使用 `t()` 调用

✅ **技能商店入口（P1）**
- 侧边栏已添加「技能商店」导航项
- 导航图标使用 skills 图标

✅ **登出功能（P0）**
- 侧边栏已添加登出按钮
- 登出 API 调用（`/api/auth/logout`）
- 移动端和桌面端都有登出按钮

### 需要继续开发的部分

🔴 **P0 - 简体中文本地化**
- 已有 `lib/i18n.ts` 翻译系统
- 部分页面仍需检查和完善翻译
- 需要扫描所有 `.tsx`/`.ts` 文件

🔴 **P0 - 登录认证功能**
- `app/login/` 目录已存在，需要完善
- `middleware.ts` 已存在，需要完善路由保护
- `lib/auth-session.ts` 已存在，需要完善 Session 管理
- `app/api/auth/` 目录已存在，需要实现 login/session API

🟡 **P1 - 技能商店功能**
- 入口已完成，但功能页面未实现
- `app/skill-store/` 目录已存在，需要开发
- API 接口（`/api/skills/store/*`, `/api/skills/install/*`）需要实现

---

## 🚀 团队启动指令

### 第一阶段：立即启动

请立即启动以下 3 个 agent（可并行）：

#### 1. 🏛️ architect (架构师 云图)

**任务文件**: `assignments/architect.md`

**首要任务**: 登录认证架构设计（P0）

**原因**: 登录认证是最高优先级任务，需要先完成架构设计，其他成员才能继续开发

**启动命令**:
```bash
openclaw agent:invoke:architect
```

---

#### 2. 🎨 frontend-dev (前端工程师 星轨)

**任务文件**: `assignments/frontend-dev.md`

**首要任务**: 简体中文本地化（P0）

**原因**: 可以立即开始，不依赖其他成员

**启动命令**:
```bash
openclaw agent:invoke:frontend-dev
```

---

#### 3. 🚀 fullstack-dev (全栈工程师 翼展)

**任务文件**: `assignments/fullstack-dev.md`

**首要任务**: 
1. 配合本地化任务（检查修改的文件）
2. 完善模型添加功能的后端 API（`/api/models/add`）

**原因**: 可以立即开始，完善现有代码

**启动命令**:
```bash
openclaw agent:invoke:fullstack-dev
```

---

### 第二阶段：等待 architect 完成

🏛️ **architect 完成架构设计后**，启动以下 2 个 agent：

#### 4. 🔧 backend-dev (后端工程师 核芯)

**任务文件**: `assignments/backend-dev.md`

**首要任务**:
1. 实现登录认证 API（`/api/auth/login`, `/api/auth/session`）
2. 实现技能商店 API（`/api/skills/store/*`, `/api/skills/install/*`）

**依赖**: 必须等待 architect 完成架构设计

**启动命令**:
```bash
openclaw agent:invoke:backend-dev
```

---

### 第三阶段：开发完成后

所有功能开发完成后，启动测试：

#### 5. 🧪 qa-engineer (测试工程师 探微)

**任务文件**: `assignments/qa-engineer.md`

**任务**: 全面测试所有功能

**启动时机**: 所有开发完成后

**启动命令**:
```bash
openclaw agent:invoke:qa-engineer
```

---

## 📊 任务优先级

| 优先级 | 模块 | 状态 | 负责人 |
|:---|:---|:---|:---|
| 🔴 P0 | 简体中文本地化 | 部分完成 | frontend-dev |
| 🔴 P0 | 登录认证功能 | 部分完成 | backend-dev + frontend-dev |
| 🟡 P1 | 模型添加功能 | 基本完成 | fullstack-dev |
| 🟡 P1 | 技能商店功能 | 入口完成 | frontend-dev + backend-dev |

---

## 🔗 协作流程

### 架构先行
- architect 必须先完成登录认证架构设计
- 其他成员依赖架构设计结果

### 前后端对齐
- backend-dev 和 frontend-dev 需要对齐 API 接口
- 确保前后端接口一致

### 代码审查
- 所有代码提交 PR
- architect 进行代码审查
- 通过审查后合并到 main

### 测试验收
- 所有功能开发完成后
- qa-engineer 进行全面测试
- 发现问题反馈给对应负责人

---

## ⚠️ 重要提醒

1. **不要重复开发**: 模型添加功能、技能商店入口、登出功能已有代码，请先检查现有代码
2. **架构先行**: 登录认证功能必须等 architect 完成架构设计
3. **本地化优先**: frontend-dev 的本地化任务可以立即开始
4. **沟通协作**: 前后端接口对齐时，及时沟通
5. **代码质量**: architect 会进行代码审查，确保质量

---

**准备完成，请按顺序启动各成员！**

---

**生成时间**: 2026-03-27 18:30
**生成人**: 凌霄 (dev-lead)
