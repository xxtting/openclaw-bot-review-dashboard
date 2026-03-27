# OpenClaw Bot Dashboard

一个轻量级 Web 仪表盘，用于一览所有 [OpenClaw](https://github.com/openclaw/openclaw) 机器人/Agent/模型/会话的运行状态。

## 背景

当你在多个平台（飞书、Discord 等）上运行多个 OpenClaw Agent 时，管理和监控会变得越来越复杂——哪个机器人用了哪个模型？平台连通性如何？Gateway 是否正常？Token 消耗了多少？

本仪表盘读取本地 OpenClaw 配置和会话数据，提供统一的 Web 界面来实时监控和测试所有 Agent、模型、平台和会话。无需数据库——所有数据直接来源于 `~/.openclaw/openclaw.json` 和本地会话文件。此外，内置像素风动画办公室，让你的 Agent 化身像素角色在办公室里行走、就座、互动，为枯燥的运维增添一份趣味。

## 功能

- **机器人总览** — 卡片墙展示所有 Agent 的名称、Emoji、模型、平台绑定、会话统计和 Gateway 健康状态
- **模型列表** — 查看所有已配置的 Provider 和模型，包含上下文窗口、最大输出、推理支持及单模型测试
  - ✨ **新增**: 支持添加新模型功能
- **会话管理** — 按 Agent 浏览所有会话，支持类型识别（私聊、群聊、定时任务）、Token 用量和连通性测试
- **消息统计** — Token 消耗和平均响应时间趋势，支持按天/周/月查看，SVG 图表展示
- **技能管理** — 查看所有已安装技能（内置、扩展、自定义），支持搜索和筛选
  - ✨ **新增**: 技能商店入口（开发中）
- **告警中心** — 配置告警规则（模型不可用、机器人无响应），通过飞书发送通知
- **Gateway 健康检测** — 实时 Gateway 状态指示器，10 秒自动轮询，点击可跳转 OpenClaw Web 页面
- **平台连通测试** — 一键测试所有飞书/Discord 绑定和 DM Session 的连通性
- **自动刷新** — 可配置刷新间隔（手动、10秒、30秒、1分钟、5分钟、10分钟）
- **国际化** — 支持中英文界面切换（简体中文、繁体中文、English）
- **主题切换** — 侧边栏支持深色/浅色主题切换
- **像素办公室** — 像素风动画办公室，Agent 以像素角色呈现，实时行走、就座、与家具互动
- **实时配置** — 直接读取 `~/.openclaw/openclaw.json` 和本地会话文件，无需数据库
- ✨ **新增**: **登录认证功能** — 保护仪表盘访问，支持密码登录
- ✨ **新增**: **登出功能** — 安全登出，清除会话
- ✨ **新增**: **军团系统** — 创建军团、分配负责人、增加/移除成员，成员与军团双向同步
- ✨ **新增**: **模型列表优化** — Provider显示、状态指示器、编辑删除功能

## 版本更新

### v1.1.0 (2026-03-27)

**新功能**:
- 🔐 **登录认证系统**
  - 添加登录页面，支持密码认证
  - Session 管理和路由保护
  - JWT Token 认证
  - 安全登出功能

- ➕ **模型添加功能**
  - 模型列表页新增「添加模型」按钮
  - 完整的添加模型表单（Provider、Model ID、Name、API Key、Access Mode、Context Window、Max Tokens、Reasoning）
  - 表单验证和错误处理
  - 支持添加到已有 Provider 或新建 Provider

- 🏪 **技能商店**
  - 侧边栏新增「技能商店」导航入口
  - 技能展示和安装功能（API 接口待实现）

- 🌏 **本地化增强**
  - 完善简体中文翻译
  - 所有新增功能均支持多语言切换

**改进**:
- 优化侧边栏布局和交互
- 改进会话管理页面
- 完善错误提示和用户反馈

### v1.2.0 (2026-03-28)

**性能优化**:
- 🏎️ **技能商店秒开** - 首页固定10个热门技能（硬编码），移除启动时API调用，零等待
- ⏱️ **Gateway轮询优化** - 状态检测间隔从10秒调整为30秒，降低资源占用
- 📊 **Stats加载优化** - 模型统计API增加5秒超时保护，不阻塞首屏渲染
- 🎨 **骨架屏加载** - 模型列表新增骨架屏动画，体验更流畅

**新功能**:
- 🛒 **技能商店** - 首页展示18个热门技能，支持搜索/安装/卸载，优雅处理已安装场景
- 🔧 **品牌选择器** - 添加模型表单的品牌快速选择由按钮组改为下拉菜单，默认「自定义」
- 🇨🇳 **中国品牌扩展** - 新增腾讯混元、阿里通义、火山引擎、百度文心、讯飞星火、商汤日日新、阿里百炼、天工AI（共12个中国品牌）
- 💻 **Coding平台** - 新增Cursor、GitHub Copilot、Claude Code、Windsurf、Devin、Replit、Codeium、Tabnine（共9个流行Coding平台）

**Bug修复**:
- 技能安装错误处理 - 兼容中英文「已存在」错误提示

### v1.3.0 (2026-03-28)

**新功能**:
- 🦐 **军团系统**
  - 创建和管理军团（团队）
  - 军团负责人分配
  - 军团成员管理（增加/移除成员）
  - 成员与军团双向同步
  - 下拉菜单选项去重优化

- 🔧 **模型列表优化**
  - 新列表格式：序号、模型、Provider、状态、操作
  - Provider（提供商）显示
  - 在线/离线状态指示器（绿色/灰色圆点）
  - 编辑和删除功能

## 预览

### 仪表盘总览
![仪表盘预览](docs/bot_dashboard.png)

### 模型列表
![模型列表预览](docs/models-preview.png)

### 会话列表
![会话列表预览](docs/sessions-preview.png)

### 像素办公室
![像素办公室](docs/pixel-office.png)

## 快速开始

更多启动方式请见：[快速启动文档](quick_start.md)。

```bash
# 克隆仓库
git clone https://github.com/xmanrui/OpenClaw-bot-review.git
cd OpenClaw-bot-review

# 安装依赖
npm install

# 配置环境变量（可选）
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000) 即可。

### 环境变量配置

创建 `.env.local` 文件（可选）：

```bash
# 管理员密码（建议修改默认密码）
OPENCLAW_ADMIN_PASSWORD=openclaw123

# JWT 密钥（用于 Token 验证）
JWT_SECRET=your-jwt-secret-key

# 认证 URL
AUTH_URL=http://localhost:3000

# OpenClaw 配置路径（可选，默认为 ~/.openclaw）
OPENCLAW_HOME=/path/to/openclaw
```

### 登录

首次启动后，使用默认密码登录：
- 默认密码：`openclaw123`
- 建议生产环境通过 `OPENCLAW_ADMIN_PASSWORD` 环境变量修改密码

## 技术栈

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Jose** - JWT Token 处理
- **bcryptjs** - 密码哈希
- 无数据库 — 直接读取配置文件

## 环境要求

- Node.js 18+
- 已安装 OpenClclaw，配置文件位于 `~/.openclaw/openclaw.json`

## 自定义配置路径

默认读取 `~/.openclaw/openclaw.json`，可通过环境变量指定自定义路径：

```bash
OPENCLAW_HOME=/opt/openclaw 
npm run dev
```

## Docker 部署

你可以使用 Docker 部署仪表盘：

### 构建 Docker 镜像

```bash
docker build -t openclaw-dashboard .
```

### 运行容器

```bash
# 基础运行
docker run -d -p 3000:3000 openclaw-dashboard

# 使用自定义 OpenClaw 配置路径
docker run -d \
  --name openclaw-dashboard \
  -p 3000:3000 \
  -e OPENCLAW_HOME=/opt/openclaw \
  -v /path/to/openclaw:/opt/openclaw \
  openclaw-dashboard
```

## API 接口

### 认证相关

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/session` - 获取当前会话信息

### 模型相关

- `POST /api/models/add` - 添加新模型
- `DELETE /api/models/{provider}/{modelId}` - 删除模型

### 技能商店相关（开发中）

- `GET /api/skills/store/list` - 获取技能列表
- `GET /api/skills/store/detail/{skillId}` - 获取技能详情
- `POST /api/skills/install` - 安装技能
- `POST /api/skills/uninstall` - 卸载技能

## 安全建议

⚠️ **生产环境安全建议**：

1. **修改默认密码**：务必通过环境变量 `OPENCLAW_ADMIN_PASSWORD` 设置强密码
2. **使用 HTTPS**：生产环境建议使用 HTTPS
3. **定期更新**：保持依赖包更新，修复安全漏洞
4. **限制访问**：通过防火墙或反向代理限制访问 IP

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 原作者

**xmanrui** - 小红书：[主页](https://xhslink.com/m/AsJKWgEBt1I)  
**微信**: xmanr123
## 新作者
  **星星**
## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 强大的 AI Agent 框架
- [Next.js](https://nextjs.org/) - React 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架

---

**OpenClaw Bot Dashboard** - 让你的 Agent 更好地运行！🦞
