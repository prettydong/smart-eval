#include "generateFails.h"
#include "repairRegion.cpp"
#include <cstdlib>
#include <cstring>
#include <fmt/core.h>
#include <iostream>
#include <random>
#include <sstream>
#include <string>

// ─── 简单 JSON 输出工具 ───
// 不引入第三方 JSON 库，手写轻量输出

static std::string escapeJson(const std::string &s) {
  std::string out;
  for (char c : s) {
    switch (c) {
    case '"':
      out += "\\\"";
      break;
    case '\\':
      out += "\\\\";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      out += c;
      break;
    }
  }
  return out;
}

// ─── 打印帮助 ───
static void printUsage(const char *prog) {
  fmt::print(stderr,
             "Usage: {} [options]\n"
             "\n"
             "Mode (required, choose one):\n"
             "  -lcr                Use PureLCRProduct solver\n"
             "  -ccr                Use PureCCRProduct solver\n"
             "\n"
             "Fail generation (required):\n"
             "  -sparse  <n>        Number of sparse (random) fails\n"
             "  -rowfail <n>        Number of row-line fail lines\n"
             "  -colfail <n>        Number of col-line fail lines\n"
             "\n"
             "Address space:\n"
             "  -maxrow  <n>        Max row address (default: 16384)\n"
             "  -maxcol  <n>        Max col address (default: 1024)\n"
             "\n"
             "Solver parameters:\n"
             "  -rowcap  <n>        Row repair capacity (default: 128)\n"
             "  -sectioncnt <n>     Section count (default: 48)\n"
             "  -colseg <n>         Col segment (default: 2)\n"
             "  -sectionGroupSize <n>   (default: 2048)\n"
             "  -subsectionSize <n>     (default: 344)\n"
             "  -subsectionsPerGroup <n> (default: 6)\n"
             "\n"
             "LCR-specific:\n"
             "  -cpsPerRegion <n>   CPs per region (default: 2)\n"
             "  -lcrCap <n>         LCR group capacity (default: 2)\n"
             "\n"
             "CCR-specific:\n"
             "  -ccrGroupsPerSection <n> CCR groups per section (default: 8)\n"
             "  -ccrCap <n>         CCR group capacity (default: 2)\n"
             "\n"
             "Execution:\n"
             "  -runcnt <n>         Number of runs (default: 1)\n"
             "  -seed   <n>         Base random seed (default: random)\n"
             "  -h / --help         Show this help\n",
             prog);
}

// ─── 参数解析辅助 ───
static bool tryParseInt(int argc, char *argv[], int &i, const char *flag,
                        int &out) {
  if (strcmp(argv[i], flag) == 0 && i + 1 < argc) {
    out = std::atoi(argv[++i]);
    return true;
  }
  return false;
}

static bool tryParseUint32(int argc, char *argv[], int &i, const char *flag,
                           uint32_t &out) {
  if (strcmp(argv[i], flag) == 0 && i + 1 < argc) {
    out = (uint32_t)std::strtoul(argv[++i], nullptr, 10);
    return true;
  }
  return false;
}

// ─── 将 RepairSolution 序列化为 JSON 字符串 ───
static std::string solutionToJson(const RepairSolution &sol,
                                  const std::set<Address2D_> &fails,
                                  unsigned seed, int runIndex) {
  std::ostringstream os;
  os << "    {\n";
  os << "      \"run\": " << runIndex << ",\n";
  os << "      \"seed\": " << seed << ",\n";
  os << "      \"totalFails\": " << fails.size() << ",\n";
  os << "      \"feasible\": " << (sol.feasible ? "true" : "false") << ",\n";
  os << "      \"solveTime\": " << sol.solve_time << ",\n";
  os << "      \"greedyTime\": " << sol.greedy_time << ",\n";
  os << "      \"mipTime\": " << sol.mip_time << ",\n";
  os << "      \"solvedBy\": \"" << escapeJson(sol.solvedByStr()) << "\"";

  if (sol.feasible) {
    os << ",\n";
    os << "      \"objectiveValue\": " << sol.objective_value << ",\n";
    os << "      \"totalUsed\": " << sol.getTotalUsed() << ",\n";

    // group_usage
    os << "      \"groupUsage\": {";
    {
      bool first = true;
      for (auto &[gid, cnt] : sol.group_usage) {
        if (!first)
          os << ", ";
        os << "\"" << gid << "\": " << cnt;
        first = false;
      }
    }
    os << "},\n";

    // row_repairs
    os << "      \"rowRepairs\": {";
    {
      bool first = true;
      for (auto &[row, cols] : sol.row_repairs) {
        if (!first)
          os << ", ";
        os << "\"" << row << "\": [";
        for (size_t c = 0; c < cols.size(); c++) {
          if (c > 0)
            os << ", ";
          os << cols[c];
        }
        os << "]";
        first = false;
      }
    }
    os << "},\n";

    // col_repairs
    os << "      \"colRepairs\": {";
    {
      bool first = true;
      for (auto &[col, rows] : sol.col_repairs) {
        if (!first)
          os << ", ";
        os << "\"" << col << "\": [";
        for (size_t r = 0; r < rows.size(); r++) {
          if (r > 0)
            os << ", ";
          os << rows[r];
        }
        os << "]";
        first = false;
      }
    }
    os << "},\n";

    // col_strategies
    os << "      \"colStrategies\": {";
    {
      bool first = true;
      for (auto &[col, strats] : sol.col_strategies) {
        if (!first)
          os << ", ";
        os << "\"" << col << "\": [";
        bool firstS = true;
        for (auto &s : strats) {
          if (!firstS)
            os << ", ";
          os << "\"" << escapeJson(s) << "\"";
          firstS = false;
        }
        os << "]";
        first = false;
      }
    }
    os << "},\n";

    // assignments
    os << "      \"assignments\": [\n";
    for (size_t a = 0; a < sol.assignments.size(); a++) {
      auto &[addr, name] = sol.assignments[a];
      os << "        {\"row\": " << addr.row << ", \"col\": " << addr.col
         << ", \"group\": \"" << escapeJson(name) << "\"}";
      if (a + 1 < sol.assignments.size())
        os << ",";
      os << "\n";
    }
    os << "      ]\n";
  } else {
    os << ",\n";
    os << "      \"solverStatus\": \"" << escapeJson(sol.solver_status)
       << "\",\n";
    // 不可解时也输出原始 fail 点，让前端能显示 fail 分布
    os << "      \"assignments\": [\n";
    bool firstA = true;
    for (auto &f : fails) {
      if (!firstA)
        os << ",\n";
      os << "        {\"row\": " << f.row << ", \"col\": " << f.col
         << ", \"group\": \"Fail\"}";
      firstA = false;
    }
    os << "\n      ]\n";
  }

  os << "    }";
  return os.str();
}

// ─── 将 fail 集合序列化为 JSON 数组字符串 ───
static std::string failsToJson(const std::set<Address2D_> &fails) {
  std::ostringstream os;
  os << "[";
  bool first = true;
  for (auto &f : fails) {
    if (!first)
      os << ", ";
    os << "{\"row\": " << f.row << ", \"col\": " << f.col << "}";
    first = false;
  }
  os << "]";
  return os.str();
}

int main(int argc, char *argv[]) {
  // ─── 默认值 ───
  bool useLCR = false;
  bool useCCR = false;

  int sparse = -1;  // required
  int rowfail = -1; // required
  int colfail = -1; // required

  int maxrow = 16384;
  int maxcol = 1024;
  int rowcap = 128;
  int sectioncnt = 48;
  int colseg = 2;
  uint32_t sectionGroupSize = 2048;
  uint32_t subsectionSize = 344;
  uint32_t subsectionsPerGroup = 6;

  // LCR-specific
  int cpsPerRegion = 2;
  int lcrCap = 2;

  // CCR-specific
  int ccrGroupsPerSection = 8;
  int ccrCap = 2;

  int runcnt = 1;
  unsigned baseSeed = 0;
  bool seedSet = false;

  // ─── 解析参数 ───
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
      printUsage(argv[0]);
      return 0;
    }
    if (strcmp(argv[i], "-lcr") == 0) {
      useLCR = true;
      continue;
    }
    if (strcmp(argv[i], "-ccr") == 0) {
      useCCR = true;
      continue;
    }
    if (tryParseInt(argc, argv, i, "-sparse", sparse))
      continue;
    if (tryParseInt(argc, argv, i, "-rowfail", rowfail))
      continue;
    if (tryParseInt(argc, argv, i, "-colfail", colfail))
      continue;
    if (tryParseInt(argc, argv, i, "-maxrow", maxrow))
      continue;
    if (tryParseInt(argc, argv, i, "-maxcol", maxcol))
      continue;
    if (tryParseInt(argc, argv, i, "-rowcap", rowcap))
      continue;
    if (tryParseInt(argc, argv, i, "-sectioncnt", sectioncnt))
      continue;
    if (tryParseInt(argc, argv, i, "-colseg", colseg))
      continue;
    if (tryParseUint32(argc, argv, i, "-sectionGroupSize", sectionGroupSize))
      continue;
    if (tryParseUint32(argc, argv, i, "-subsectionSize", subsectionSize))
      continue;
    if (tryParseUint32(argc, argv, i, "-subsectionsPerGroup",
                       subsectionsPerGroup))
      continue;
    if (tryParseInt(argc, argv, i, "-cpsPerRegion", cpsPerRegion))
      continue;
    if (tryParseInt(argc, argv, i, "-lcrCap", lcrCap))
      continue;
    if (tryParseInt(argc, argv, i, "-ccrGroupsPerSection", ccrGroupsPerSection))
      continue;
    if (tryParseInt(argc, argv, i, "-ccrCap", ccrCap))
      continue;
    if (tryParseInt(argc, argv, i, "-runcnt", runcnt))
      continue;
    if (strcmp(argv[i], "-seed") == 0 && i + 1 < argc) {
      baseSeed = (unsigned)std::strtoul(argv[++i], nullptr, 10);
      seedSet = true;
      continue;
    }

    fmt::print(stderr, "Error: Unknown option '{}'\n", argv[i]);
    printUsage(argv[0]);
    return 1;
  }

  // ─── 校验必选参数 ───
  if (!useLCR && !useCCR) {
    fmt::print(stderr, "Error: Must specify -lcr or -ccr\n");
    printUsage(argv[0]);
    return 1;
  }
  if (useLCR && useCCR) {
    fmt::print(stderr, "Error: Cannot specify both -lcr and -ccr\n");
    return 1;
  }
  if (sparse < 0 || rowfail < 0 || colfail < 0) {
    fmt::print(stderr, "Error: Must specify -sparse, -rowfail, and -colfail\n");
    printUsage(argv[0]);
    return 1;
  }

  // ─── 种子 ───
  if (!seedSet) {
    std::random_device rd;
    baseSeed = rd();
  }

  // ─── 构造 TestCase ───
  TestCase tc = {.sparseFailCount = sparse,
                 .colLineFailCount = colfail,
                 .rowLineFailCount = rowfail};

  // ─── JSON 输出 ───
  std::ostringstream json;
  json << "{\n";
  json << "  \"mode\": \"" << (useLCR ? "LCR" : "CCR") << "\",\n";
  json << "  \"baseSeed\": " << baseSeed << ",\n";
  json << "  \"runcnt\": " << runcnt << ",\n";

  // 写入配置
  json << "  \"config\": {\n";
  json << "    \"sparse\": " << sparse << ",\n";
  json << "    \"rowfail\": " << rowfail << ",\n";
  json << "    \"colfail\": " << colfail << ",\n";
  json << "    \"maxrow\": " << maxrow << ",\n";
  json << "    \"maxcol\": " << maxcol << ",\n";
  json << "    \"rowcap\": " << rowcap << ",\n";
  json << "    \"sectioncnt\": " << sectioncnt << ",\n";
  json << "    \"colseg\": " << colseg << ",\n";
  json << "    \"sectionGroupSize\": " << sectionGroupSize << ",\n";
  json << "    \"subsectionSize\": " << subsectionSize << ",\n";
  json << "    \"subsectionsPerGroup\": " << subsectionsPerGroup << ",\n";
  if (useLCR) {
    json << "    \"cpsPerRegion\": " << cpsPerRegion << ",\n";
    json << "    \"lcrCap\": " << lcrCap << "\n";
  } else {
    json << "    \"ccrGroupsPerSection\": " << ccrGroupsPerSection << ",\n";
    json << "    \"ccrCap\": " << ccrCap << "\n";
  }
  json << "  },\n";

  json << "  \"runs\": [\n";

  for (int r = 0; r < runcnt; r++) {
    unsigned seed = baseSeed + (unsigned)r;

    // 生成 fail
    FailGenerator gen(maxrow, maxcol, seed);
    auto fails = gen.generate(tc);

    // 创建 solver
    RepairSolution sol;
    if (useLCR) {
      PureLCRProduct solver(maxcol, maxrow, cpsPerRegion, lcrCap, rowcap,
                            sectioncnt, colseg, sectionGroupSize,
                            subsectionSize, subsectionsPerGroup);
      solver.setLogLevel(LogLevel::SILENT);
      sol = solver.solve(fails);
    } else {
      PureCCRProduct solver(maxcol, maxrow, ccrGroupsPerSection, ccrCap, rowcap,
                            sectioncnt, colseg, sectionGroupSize,
                            subsectionSize, subsectionsPerGroup);
      solver.setLogLevel(LogLevel::SILENT);
      sol = solver.solve(fails);
    }

    json << solutionToJson(sol, fails, seed, r);
    if (r + 1 < runcnt)
      json << ",";
    json << "\n";
  }

  json << "  ]\n";
  json << "}\n";

  // 输出到 stdout
  std::cout << json.str();

  return 0;
}
