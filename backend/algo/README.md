# DRAM 冗余修复方案文档

## 📋 概述

本项目实现了一个基于 **MIP（混合整数规划）** 的 DRAM 冗余修复求解器，使用 **HiGHS** 作为底层优化引擎。该方案将 DRAM 故障修复问题建模为**集合覆盖问题（Set Cover Problem）**，以最小化冗余资源使用量为目标，自动计算最优的修复策略。

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     DramRepairSolver                        │
│                      (基类/抽象类)                           │
├─────────────────────────────────────────────────────────────┤
│  • 通用 MIP 模型构建                                         │
│  • HiGHS 求解器调用                                          │
│  • 解析与输出                                                │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  OP-1a   │        │  OP-1b   │        │  OP-3    │
    │  OP-1c   │        │  OP-1d   │        │          │
    │          │        │  OP-1e   │        │          │
    └──────────┘        └──────────┘        └──────────┘
```

---

## 🔧 冗余资源类型

系统支持三种冗余修复资源：

| 类型 | 名称 | 描述 | 典型容量 |
|------|------|------|----------|
| **ROW_RED** | 行冗余 (Global Row) | 全局行修复，可修复任意行 | 128 |
| **LCR_RED** | 本地列冗余 (Local Column Redundancy) | 区域内的列修复资源 | 1~3 per group |
| **CCR_RED** | 公共列冗余 (Common Column Redundancy) | 跨区域共享的列修复资源 | 2 per group |

---

## 📐 地址映射模型

### 关键参数

| 参数 | 含义 | 默认值 |
|------|------|--------|
| `sectionCnt_` | 总 Section 数量 | 48 |
| `colSeg_` | 列分段数 | 1 或 2 |
| `bigSectionCnt_` | 大 Section 数量 | sectionCnt_ / colSeg_ |
| `regionCnt_` | Region 数量 | 4 或 5 或 19 |
| `cpAddr_` | CP 边界地址表 | [0, 56, 112, 168, ... 2048] |

### 地址转换

```cpp
// 从物理地址提取 CP 索引和 CSL 偏移
int cp  = addr2CP_(col_addr);    // 列地址所属的 CP
int csl = addr2Csl_(col_addr);   // 在 CP 内的偏移量
int big_section = getBigSectionIdx_(row_addr);  // 行地址对应的大 Section
```

---

## 🎯 修复策略详解

### OP-1a

**特点**：标准 4-Region 划分，CP 8/9 特殊处理

| Region | CP 范围 | 修复类型 |
|--------|---------|----------|
| 0 | CP 0~3 | LCR |
| 1 | CP 4~7 | LCR |
| 2 | CP 10~13 | LCR |
| 3 | CP 14~18 | LCR |
| 特殊 | CP 8, 9, 17 | CCR |

**CSL 规则**：
- `csl < 48`：使用 CCR
- `csl >= 48`：使用 LCR（除 CP 8/9/17 外）

---

### OP-1b

**特点**：4-Region 划分，无特殊 CP 处理

| Region | CP 范围 |
|--------|---------|
| 0 | CP 0~4 |
| 1 | CP 5~8 |
| 2 | CP 9~13 |
| 3 | CP 14~18 |

---

### OP-1c

**特点**：5-Region 划分，CP 8/9/18 合并

| Region | CP 范围 |
|--------|---------|
| 0 | CP 0~3 |
| 1 | CP 4~7 |
| 2 | CP 8~9, 18 |
| 3 | CP 10~13 |
| 4 | CP 14~17 |

---

### OP-1d

**特点**：继承 OP-1b，`colSeg = 1`（更细粒度分段）

---

### OP-1e

**特点**：继承 OP-1c，`colSeg = 1`（更细粒度分段）

---

### OP-3

**特点**：每个 CP 独立 LCR，无 CCR

| 配置 | 值 |
|------|-----|
| Region 数量 | 19 (每个 CP 独立) |
| CCR 数量 | 0 |
| LCR 容量 | 3 per group |

---

## 🧮 MIP 模型

### 决策变量

```
x_r ∈ {0, 1}  -- 是否使用行修复来修复行 r
x_{c,g} ∈ {0, 1}  -- 是否使用组 g 来修复列 c
```

### 目标函数

```
Minimize: Σ x_r + Σ x_{c,g}
```

最小化总冗余使用量。

### 约束条件

**1. 覆盖约束（每个故障必须被修复）**
```
∀ fail (r, c):  x_r + Σ x_{c,g} ≥ 1
                       g ∈ available_groups(c, r)
```

**2. 容量约束（不超过资源限制）**
```
Σ x_r ≤ ROW_CAPACITY        (行冗余容量)
Σ x_{c,g} ≤ GROUP_CAPACITY  (每组列冗余容量)
```

---

## ⚡ repairMost 贪心启发式

### 两阶段求解策略

系统采用 **两阶段求解策略**，优先使用快速启发式，以减少不必要的 MIP 求解开销：

```
┌──────────────────────────┐
│    Phase 1: repairMost   │  贪心启发式，O(n²) 级别
│    (快速路径)             │  通常 < 1ms
└──────────┬───────────────┘
           │
     成功？ ├── ✓ 直接返回 → 结束
           │
           └── ✗ 失败（资源不足）
                    │
           ┌───────▼──────────────┐
           │  Phase 2: HiGHS MIP  │  精确求解，最优解
           │  (回退路径)           │  通常 10~100ms
           └──────────────────────┘
```

**设计动机**：对于大多数可修复的 fail 集合，贪心算法已经足够找到可行解。只有当贪心因资源分配冲突导致失败时，才启动更耗时的 MIP 精确求解。

### 算法思路

`repairMost`（代码中为 `quickSolve_`）是一个**贪心集合覆盖**算法，核心思路如下：

1. **初始化**：将所有 fail 放入 `uncovered` 集合，初始化每个 group 的剩余容量 `remaining_cap`
2. **贪心选择循环**：每轮从两类候选动作中选择**覆盖最多未修复 fail** 的动作：
   - **候选 1 — 行修复**：遍历所有故障行，计算每行能覆盖多少 `uncovered` 中的 fail
   - **候选 2 — 列-组修复**：遍历所有 `(col, group)` 对，计算每对能覆盖多少 `uncovered` 中的 fail
3. **执行动作**：选择覆盖数最大的候选，将其覆盖的 fail 从 `uncovered` 中移除，并扣减对应 group 的容量
4. **终止条件**：
   - `uncovered` 为空 → **成功**，返回可行解
   - 两类候选的最大覆盖数均为 0 → **失败**，回退到 HiGHS MIP

```
伪代码：
───────────────────────────────────────
uncovered ← 全部 fail
remaining_cap[g] ← 每个 group 的容量

while uncovered ≠ ∅:
    best_action ← argmax(coverage)  // 在行修复和列-组修复中选最大
    if best_action.coverage == 0:
        return FAIL  → 转 HiGHS MIP

    执行 best_action
    从 uncovered 中移除被覆盖的 fail
    remaining_cap[对应 group] -= 1

return SUCCESS (可行解)
───────────────────────────────────────
```

### Local Column (LCR) 约束处理

LCR 是**局部列冗余**资源，与 Global Row 不同，它有严格的**区域 + Section 绑定**约束。`repairMost` 通过以下机制正确处理 LCR 约束：

#### 1. 预计算合法 group 映射 (`group_cache`)

在 `solve()` 的预处理阶段，对每个 fail `(row, col)` 调用 `getColAvailableGroups_(col, row)`，计算出该 fail 可以被哪些 group 修复，结果缓存在 `group_cache` 中：

```cpp
// group_cache[{col, row}] = [可用的 group ID 列表]
// 例如：
//   fail (100, 500) → group_cache[{500, 100}] = [LCR_3]  (只有一个 LCR group)
//   fail (100, 50)  → group_cache[{50, 100}]  = [CCR_12] (走 CCR)
```

每个 LCR group 的编号由 `(big_section_idx, region)` 唯一决定：
```
lcr_idx = lcrOffset_ + big_section_idx × regionCnt_ + region
```

这意味着不同 Section、不同 Region 的 fail **使用不同的 LCR group**，天然是隔离的。

#### 2. 容量约束 (`remaining_cap`)

每个 LCR group 的初始容量通常为 **1**（only 1 repair line per LCR group）。贪心每次选中一个 `(col, group)` 对时：

```cpp
remaining_cap[g]--;  // 扣减该 group 容量
```

当 `remaining_cap[g] <= 0` 时，该 group 的所有候选将被自动跳过：

```cpp
if (remaining_cap[g] <= 0)
    continue;  // 容量耗尽，跳过该 (col, group) 候选
```

#### 3. 覆盖数验证

即使某个 fail 的故障列与某个 `(col, group)` 候选相同，也不会盲目计入覆盖数。算法会通过 `group_cache` 确认该 fail **确实可以被该 group 修复**：

```cpp
// 对于候选 (col, group=g)，遍历 col 的所有 fail：
for (const auto &f : col_to_fails[col]) {
    if (!uncovered.count(f)) continue;
    // 查询 group_cache 确认此 fail 可被 group g 修复
    auto &valid_groups = group_cache[{f.col, f.row}];
    if (g ∈ valid_groups) {
        cover++;  // 确认可修复，计入覆盖数
    }
}
```

这保证了贪心决策的正确性：**一个 LCR group 只会修复属于其管辖范围内（特定 Section + Region）的 fail**。

#### 约束处理总结

| 约束类型 | 实现机制 | 说明 |
|----------|----------|------|
| **区域绑定** | `group_cache` 预计算 | 每个 fail 通过 `getColAvailableGroups_` 映射到合法 group |
| **Section 绑定** | `big_section_idx` 编入 group ID | 不同 Section 的 LCR 自然隔离 |
| **容量限制** | `remaining_cap[g]` 递减 | LCR 容量为 1，用完即跳过 |
| **覆盖正确性** | 选择时验证 `group_cache` | 防止将不属于该 group 的 fail 误计 |

---

## 📊 输出示例

```
═══ OPTIMAL SOLUTION ═══
Total lines used: 15 (Time: 0.032s)

【Statistics】
  Row Redundancy:  3 lines
  LCR Redundancy:  8 lines
  CCR Redundancy:  4 lines

【Row Repairs】
  Row  42 (Group 0) repairs 5 fails: (42,10) (42,25) (42,100) (42,200) (42,500)

【Column Repairs】
  Col 100 (LCR3 ) repairs 3 fails: (10,100) (20,100) (30,100)
  Col 200 (CCR12) repairs 2 fails: (15,200) (25,200)

【Group Usage】
  Group  0 (  Global Row): 3/128
  Group  5 (        LCR4): 2/1
  Group 97 (       CCR12): 1/2
```

---

## 🚀 使用方法

### 1. 命令行接口 (CLI)

本项目提供了一个功能强大的命令行工具，用于快速进行修复模拟、性能评估并输出详细的 JSON 结果。

#### 基本语法
```bash
./main -lcr|-ccr -sparse <n> -rowfail <n> -colfail <n> [options]
```

#### 必选核心参数
| 参数 | 类型 | 说明 |
|------|------|------|
| `-lcr` | 模式开关 | 使用 **PureLCRProduct** 求解器 (Local Column Redundancy) |
| `-ccr` | 模式开关 | 使用 **PureCCRProduct** 求解器 (Common Column Redundancy) |
| `-sparse` | 整数 | 随机生成的稀疏故障 (Single Bit Fail) 数量 |
| `-rowfail` | 整数 | 随机生成的整行故障 (Row-line Fail) 数量 |
| `-colfail` | 整数 | 随机生成的整列故障 (Col-line Fail) 数量 |

#### 控制与执行选项
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-runcnt <n>` | 1 | 模拟运行的次数 |
| `-seed <n>` | 随机 | 基础随机种子，多轮运行时每轮会递增 |
| `-maxrow <n>` | 16384 | 芯片最大行地址 |
| `-maxcol <n>` | 1024 | 芯片最大列地址 |
| `-rowcap <n>` | 128 | 全局行冗余 (Row Redundancy) 总量 |

#### 求解器高级参数
- **通用**: `-sectioncnt` (48), `-colseg` (2), `-sectionGroupSize` (2048)
- **LCR 专用**: `-cpsPerRegion` (2), `-lcrCap` (2)
- **CCR 专用**: `-ccrGroupsPerSection` (8), `-ccrCap` (2)

#### 运行示例
```bash
# 评估 100 组 300 稀疏故障在 LCR 架构下的修复率
./main -lcr -sparse 300 -rowfail 0 -colfail 0 -runcnt 100 > result.json
```

#### JSON 输出说明
输出包含三大部分：配置概要 (`config`)、运行汇总以及每轮的详细结果 (`runs`)。每轮结果包含：
- `feasible`: 是否可修复
- `solveTime`: 总耗时 (秒)
- `solvedBy`: 求解路径 (QuickSolve 或 HiGHS)
- `assignments`: 详细的 fail-to-repair-resource 分配映射

---

### 2. C++ API 调用

如果您需要在自己的代码中集成求解器：

```cpp
#include "repairRegion.cpp"

int main() {
    // 1. 选择并构造求解器
    // PureLCRProduct 允许自定义 region 划分、容量等参数
    PureLCRProduct solver(1024, 16384, 2, 2, 128);
    
    // 2. 设置日志级别
    solver.setLogLevel(LogLevel::DETAILED);
    
    // 3. 定义故障集合
    std::set<Address2D_> fails = {
        {10, 100}, {20, 100}, {30, 200},
        {42, 10},  {42, 25},  {42, 500}
    };
    
    // 4. 求解
    RepairSolution solution = solver.solve(fails);
    
    // 5. 输出结果
    solver.printSolution(solution, fails);
    
    return 0;
}
```

---

## 📁 文件结构

```
cxmt-ra-smart-eval/
├── main.cpp              # 入口文件
├── repairRegion.cpp      # 核心求解器实现
├── Makefile              # 构建配置
├── .clangd               # Clangd 配置
├── third_party/
│   ├── highs/            # HiGHS 源码
│   ├── highs-install/    # HiGHS 安装
│   ├── fmt/              # fmt 库源码
│   └── fmt-install/      # fmt 安装
└── README.md             # 本文档
```

---

## 🔗 依赖

| 库 | 版本 | 用途 |
|----|------|------|
| **HiGHS** | 1.13.0 | MIP 求解器 |
| **{fmt}** | 12.1.1 | 现代格式化输出 |
| **C++20** | - | 语言标准 |

---

## 📝 TODO

- [ ] 添加更多修复策略变体
- [ ] 支持从文件读取故障列表
- [ ] 添加修复结果可视化
- [ ] 性能基准测试
- [ ] 单元测试覆盖

---

## 📄 License

MIT License

---

*Generated on 2026-02-09*
