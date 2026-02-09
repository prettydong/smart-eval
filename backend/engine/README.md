# DRAM Repair Solver - Go API Engine

Go 后端 API 服务，封装 C++ 求解器，提供 RESTful JSON 接口。

## 🏗️ 架构

```
┌─────────────┐     HTTP/JSON    ┌──────────────┐    exec + args    ┌─────────────────┐
│   Frontend   │  ─────────────▶  │   Go API     │  ──────────────▶  │  C++ Solver      │
│   (Browser)  │  ◀─────────────  │   (Gin)      │  ◀──────────────  │  (repair_solver) │
└─────────────┘     JSON resp    └──────────────┘    JSON stdout    └─────────────────┘
```

## 🚀 快速开始

### 1. 编译 C++ 求解器

```bash
cd ../algo
make
```

### 2. 启动 Go API 服务

```bash
cd backend/engine
go build -o bin/server .
SOLVER_PATH=../algo/output/repair_solver ./bin/server
```

服务默认监听 `http://localhost:8080`。

### 3. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SOLVER_PATH` | `../algo/output/repair_solver` | C++ 求解器二进制路径 |
| `PORT` | `8080` | HTTP 监听端口 |

## 📡 API 接口

### `GET /api/v1/health` — 健康检查

```bash
curl http://localhost:8080/api/v1/health
```

```json
{
  "status": "ok",
  "service": "dram-repair-solver",
  "time": "2026-02-09T17:30:00+08:00"
}
```

### `POST /api/v1/solve` — 运行求解器

#### 请求体

```json
{
  "mode": "lcr",
  "sparse": 300,
  "rowfail": 0,
  "colfail": 0,
  "runcnt": 10,
  "seed": 42
}
```

#### 参数说明

| 参数 | 类型 | 必选 | 默认值 | 说明 |
|------|------|------|--------|------|
| `mode` | string | ✅ | — | `"lcr"` 或 `"ccr"` |
| `sparse` | int | ✅ | — | 稀疏故障数量 |
| `rowfail` | int | — | 0 | 行故障数量 |
| `colfail` | int | — | 0 | 列故障数量 |
| `runcnt` | int | — | 1 | 运行次数 |
| `seed` | uint32 | — | random | 随机种子 |
| `maxrow` | int | — | 16384 | 最大行地址 |
| `maxcol` | int | — | 1024 | 最大列地址 |
| `rowcap` | int | — | 128 | 行冗余容量 |
| `sectioncnt` | int | — | 48 | Section 数量 |
| `colseg` | int | — | 2 | 列分段数 |
| `sectionGroupSize` | uint32 | — | 2048 | — |
| `subsectionSize` | uint32 | — | 344 | — |
| `subsectionsPerGroup` | uint32 | — | 6 | — |
| `cpsPerRegion` | int | — | 2 | LCR: CPs per region |
| `lcrCap` | int | — | 2 | LCR: 组容量 |
| `ccrGroupsPerSection` | int | — | 8 | CCR: 每 section 组数 |
| `ccrCap` | int | — | 2 | CCR: 组容量 |
| `timeout` | int | — | 300 | 超时 (秒) |

#### 响应

直接返回 C++ 求解器输出的 JSON，结构如下：

```json
{
  "mode": "LCR",
  "baseSeed": 42,
  "runcnt": 10,
  "config": { ... },
  "runs": [
    {
      "run": 0,
      "seed": 42,
      "totalFails": 300,
      "feasible": true,
      "solveTime": 0.032,
      "solvedBy": "QuickSolve",
      "assignments": [ ... ]
    }
  ]
}
```

#### 错误响应

```json
{
  "error": "invalid_request",
  "message": "...",
  "hint": "Required fields: mode (lcr|ccr), sparse (>=0)."
}
```

## 📁 文件结构

```
backend/engine/
├── main.go              # 入口: 配置路由, 启动服务
├── handler/
│   └── solver.go        # HTTP handler: 请求校验, 调用 solver
├── solver/
│   └── runner.go        # 核心: 参数转换, 执行 C++, 返回 JSON
├── bin/
│   └── server           # 编译产物
├── go.mod
└── go.sum
```

## 🧪 测试示例

```bash
# 健康检查
curl http://localhost:8080/api/v1/health

# LCR 模式, 300 个稀疏故障, 跑 100 次
curl -X POST http://localhost:8080/api/v1/solve \
  -H "Content-Type: application/json" \
  -d '{"mode":"lcr","sparse":300,"rowfail":0,"colfail":0,"runcnt":100}'

# CCR 模式, 自定义参数
curl -X POST http://localhost:8080/api/v1/solve \
  -H "Content-Type: application/json" \
  -d '{"mode":"ccr","sparse":50,"rowfail":2,"colfail":1,"seed":42,"ccrCap":3}'
```
