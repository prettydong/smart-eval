#!/bin/bash
# ============================================================
# build_release.sh — 一键构建 Ubuntu 22 可部署包
# 使用方式：在项目根目录运行 bash build_release.sh
# 产出：release/ 目录，包含所有需要的文件
# ============================================================
set -euo pipefail

RELEASE_DIR="release"
echo "🔨 开始构建发布包..."

# ─── 0. 清理 ───
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ─── 1. 构建前端静态文件 ───
echo "📦 [1/4] 构建前端..."
cd frontend
npm ci --silent
npm run build
cp -r dist ../release/frontend-dist
cd ..
echo "✅ 前端构建完成 → release/frontend-dist/"

# ─── 2. 构建 C++ solver（需要在目标平台或交叉编译）───
echo "📦 [2/4] 构建 C++ solver..."
cd backend/algo
make clean && make
cp output/repair_solver ../../release/repair_solver
cd ../..
echo "✅ C++ solver 构建完成 → release/repair_solver"

# ─── 3. 构建 Go 后端 ───
echo "📦 [3/4] 构建 Go 后端..."
cd backend/engine
# 如果需要交叉编译到 Linux：
# GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o ../../release/server .
go build -o ../../release/server .
cd ../..
echo "✅ Go 后端构建完成 → release/server"

# ─── 4. 复制 C++ 运行时依赖 ───
echo "📦 [4/4] 复制运行时依赖..."
mkdir -p "$RELEASE_DIR/lib"
# 复制 HiGHS 动态库
cp backend/algo/third_party/highs-install/lib/libhighs* "$RELEASE_DIR/lib/" 2>/dev/null || true
echo "✅ 依赖复制完成 → release/lib/"

# ─── 5. 创建启动脚本 ───
cat > "$RELEASE_DIR/start.sh" << 'STARTUP'
#!/bin/bash
# ============================================================
# DRAM Repair Solver — 启动脚本
# 使用：bash start.sh [port]
# ============================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"

# 设置动态库搜索路径
export LD_LIBRARY_PATH="$DIR/lib:${LD_LIBRARY_PATH:-}"

# 设置 solver 路径
export SOLVER_PATH="$DIR/repair_solver"
export PORT="$PORT"

# 检查依赖
if [ ! -f "$DIR/repair_solver" ]; then
    echo "❌ repair_solver 二进制文件不存在"
    exit 1
fi

if [ ! -f "$DIR/server" ]; then
    echo "❌ server 二进制文件不存在"
    exit 1
fi

if [ ! -d "$DIR/frontend-dist" ]; then
    echo "❌ 前端静态文件目录不存在"
    exit 1
fi

chmod +x "$DIR/repair_solver"
chmod +x "$DIR/server"

echo "🚀 DRAM Repair Solver"
echo "   API:      http://localhost:$PORT/api/v1/solve"
echo "   前端:     http://localhost:$PORT"
echo "   solver:   $DIR/repair_solver"
echo ""

# 启动服务
exec "$DIR/server"
STARTUP
chmod +x "$RELEASE_DIR/start.sh"

# ─── 6. 总结 ───
echo ""
echo "============================================================"
echo "✅ 发布包构建完成!"
echo "============================================================"
echo ""
echo "目录结构："
ls -la "$RELEASE_DIR/"
echo ""
echo "部署到 Ubuntu 22:"
echo "  1. 复制 release/ 目录到目标机器"
echo "  2. 运行 bash start.sh"
echo "  3. 浏览器打开 http://机器IP:8080"
echo ""
echo "⚠️  注意："
echo "  - C++ solver 需要在 Ubuntu 22 上重新编译（见 README）"
echo "  - 或在 Mac 上交叉编译：需要 Docker + linux 工具链"
echo "============================================================"
