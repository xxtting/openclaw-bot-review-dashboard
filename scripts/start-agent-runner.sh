#!/bin/bash
# 龙虾军团 Agent Runner Daemon 启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"

echo "🦞 启动龙虾军团 Agent Runner Daemon"
echo "   项目目录: $PROJECT_DIR"
echo "   OpenClaw主目录: $OPENCLAW_HOME"

cd "$PROJECT_DIR"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

# 检查 openclaw CLI
if ! command -v openclaw &> /dev/null; then
    echo "❌ openclaw CLI 未安装"
    exit 1
fi

# 检查 ts-node 或使用编译后的 js
if [ -f "$PROJECT_DIR/dist/scripts/agent-runner-daemon.js" ]; then
    echo "📦 使用编译后的 JS"
    node "$PROJECT_DIR/dist/scripts/agent-runner-daemon.js"
elif [ -f "$PROJECT_DIR/node_modules/.bin/ts-node" ]; then
    echo "📦 使用 ts-node"
    exec node "$PROJECT_DIR/node_modules/.bin/ts-node" "$SCRIPT_DIR/agent-runner-daemon.ts"
else
    echo "⚠️ 未找到 ts-node，先编译 TypeScript..."
    npx tsc "$SCRIPT_DIR/agent-runner-daemon.ts" --outDir "$PROJECT_DIR/dist/scripts" --esModuleInterop --skipLibCheck --module commonjs --target es2017 || true
    if [ -f "$PROJECT_DIR/dist/scripts/agent-runner-daemon.js" ]; then
        node "$PROJECT_DIR/dist/scripts/agent-runner-daemon.js"
    else
        echo "❌ 编译失败，请手动处理"
        exit 1
    fi
fi
