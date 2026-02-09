#include <Highs.h>
#include <algorithm>
#include <cassert>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using namespace std;

#ifndef ADDRESS2D_DEFINED_
#define ADDRESS2D_DEFINED_
using Address = int;

struct Address2D_ {
  Address row;
  Address col;
  void print() const { std::cout << "(" << row << ", " << col << ")"; }
  auto operator<=>(const Address2D_ &) const = default;
  bool operator==(const Address2D_ &) const = default;
};
#endif

struct PairHash {
  size_t operator()(const pair<int, int> &p) const {
    return hash<long long>()(((long long)p.first << 32) |
                             (unsigned int)p.second);
  }
};

namespace Color {
const string RESET = "\033[0m";
const string BOLD = "\033[1m";
const string RED = "\033[31m";
const string GREEN = "\033[32m";
const string YELLOW = "\033[33m";
const string BLUE = "\033[34m";
const string MAGENTA = "\033[35m";
const string CYAN = "\033[36m";
const string WHITE = "\033[37m";
const string BRIGHT_RED = "\033[91m";
const string BRIGHT_GREEN = "\033[92m";
const string BRIGHT_YELLOW = "\033[93m";
const string BRIGHT_BLUE = "\033[94m";
const string ROW_COLOR = CYAN;
const string LCR_COLOR = YELLOW;
const string CCR_COLOR = GREEN;
const string SUCCESS_COLOR = BRIGHT_GREEN;
const string ERROR_COLOR = BRIGHT_RED;
const string INFO_COLOR = BRIGHT_BLUE;
const string DEBUG_COLOR = MAGENTA;
} // namespace Color

enum class RedundancyType { LCR_RED, CCR_RED, ROW_RED, UNKNOWN };

struct PreCheckResult {
  bool definitely_infeasible;
  string reason;
};

struct RepairGroupInfo {
  int count;
  RedundancyType type;
  string name;
  string description;
  string color_code;
};

enum class SolvedBy { NONE, GREEDY, HIGHS };

struct RepairSolution {
  bool feasible;
  double objective_value;
  vector<pair<Address2D_, string>> assignments;
  map<int, int> group_usage;

  map<Address, vector<Address>> row_repairs;
  map<Address, vector<Address>> col_repairs;
  map<Address, set<string>> col_strategies;

  string solver_status;
  double solve_time;
  double greedy_time = 0; // Phase 1 耗时
  double mip_time = 0;    // Phase 2 (HiGHS) 耗时
  SolvedBy solved_by = SolvedBy::NONE;

  int getTotalUsed() const {
    return accumulate(group_usage.begin(), group_usage.end(), 0,
                      [](int sum, const auto &p) { return sum + p.second; });
  }
  int getUsageOf(int group_id) const {
    auto it = group_usage.find(group_id);
    return it != group_usage.end() ? it->second : 0;
  }
  string solvedByStr() const {
    switch (solved_by) {
    case SolvedBy::GREEDY:
      return "QuickSolve";
    case SolvedBy::HIGHS:
      return "HiGHS";
    default:
      return "N/A";
    }
  }
};

enum class LogLevel { SILENT, ERROR, BASIC, DETAILED, DEBUG };

class DramRepairSolver {
public:
  DramRepairSolver()
      : log_level_(LogLevel::BASIC), feasibility_only_(false), sectionCnt_(48),
        colSeg_(2), bigSectionCnt_(24), regionCnt_(4), rowGroupCnt_(1),
        lcrGroupCnt_(0), ccrGroupCnt_(0), allGroupCnt_(0),
        sectionGroupSize_(2048), subsectionSize_(344), subsectionsPerGroup_(6) {
    cpAddr_ = {0,   56,  112, 168, 224, 284, 340, 396, 452,  512,
               572, 628, 684, 740, 796, 856, 912, 968, 1024, 2048};
  }

  virtual ~DramRepairSolver() = default;

  void setLogLevel(LogLevel level) { log_level_ = level; }
  void setFeasibilityOnly(bool on) { feasibility_only_ = on; }
  void setCpAddr(const vector<int> &addrs) { cpAddr_ = addrs; }
  void setSectionCount(int cnt) {
    sectionCnt_ = cnt;
    bigSectionCnt_ = sectionCnt_ / colSeg_;
  }
  void setColSeg(int seg) {
    colSeg_ = seg;
    bigSectionCnt_ = sectionCnt_ / colSeg_;
  }

  template <typename F> void log_lazy(LogLevel level, F &&msg_fn) const {
    if (static_cast<int>(level) <= static_cast<int>(log_level_)) {
      string prefix, color;
      switch (level) {
      case LogLevel::ERROR:
        color = Color::RED;
        prefix = "[ERROR] ";
        break;
      case LogLevel::BASIC:
        color = Color::RESET;
        break;
      case LogLevel::DETAILED:
        color = Color::INFO_COLOR;
        prefix = "[INFO] ";
        break;
      case LogLevel::DEBUG:
        color = Color::DEBUG_COLOR;
        prefix = "[DEBUG] ";
        break;
      default:
        break;
      }
      string msg = msg_fn();
      if (level == LogLevel::ERROR)
        cerr << color << prefix << msg << Color::RESET << endl;
      else
        cout << color << prefix << msg << Color::RESET << endl;
    }
  }

  void log(LogLevel level, const string &msg) const {
    log_lazy(level, [&]() -> const string & { return msg; });
  }

  virtual Address2D_ transAddr_(Address2D_ addr) = 0;
  virtual vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const = 0;
  virtual string getName() = 0;

  RepairSolution solve(const set<Address2D_> &fails) {
    auto total_start = chrono::steady_clock::now();

    RepairSolution result;
    if (fails.empty()) {
      result.feasible = true;
      result.objective_value = 0;
      result.solver_status = "Trivial (no failures)";
      result.solve_time = 0;
      return result;
    }

    // 1. 收集故障信息并构建缓存
    set<Address> failed_rows;
    set<pair<Address, int>> unique_col_group_pairs;

    map<Address, vector<Address2D_>> row_to_fails;
    map<Address, vector<Address2D_>> col_to_fails;

    set<Address2D_> tfs;
    unordered_map<pair<Address, Address>, vector<int>, PairHash> group_cache;

    for (const auto &f : fails) {
      auto tf = transAddr_(f);
      failed_rows.insert(tf.row);
      row_to_fails[tf.row].push_back(tf);
      col_to_fails[tf.col].push_back(tf);
      tfs.insert(tf);

      auto cache_key = make_pair(tf.col, tf.row);
      auto groups = getColAvailableGroups_(tf.col, tf.row);
      group_cache[cache_key] = groups;
      for (int g : groups) {
        unique_col_group_pairs.insert({tf.col, g});
      }
    }

    log_lazy(LogLevel::BASIC,
             [&] { return "Input failures: " + to_string(fails.size()); });
    log_lazy(LogLevel::BASIC, [&] {
      return "Unique failed rows: " + to_string(failed_rows.size()) +
             ", Unique Col-Group pairs: " +
             to_string(unique_col_group_pairs.size());
    });

    // ─── Phase 1: 贪心启发式 quickSolve_ ───
    auto greedy_start = chrono::steady_clock::now();
    auto greedy_sol = quickSolve_(tfs, failed_rows, row_to_fails, col_to_fails,
                                  group_cache, unique_col_group_pairs);
    auto greedy_end = chrono::steady_clock::now();
    double greedy_elapsed =
        chrono::duration<double>(greedy_end - greedy_start).count();

    if (greedy_sol.feasible) {
      greedy_sol.solve_time =
          chrono::duration<double>(greedy_end - total_start).count();
      greedy_sol.greedy_time = greedy_elapsed;
      greedy_sol.mip_time = 0;
      greedy_sol.solved_by = SolvedBy::GREEDY;
      greedy_sol.solver_status = "Greedy";
      log_lazy(LogLevel::BASIC, [&] {
        return Color::GREEN + "Phase 1 (Greedy): SOLVED, lines=" +
               to_string((int)greedy_sol.objective_value) +
               ", time=" + to_string(greedy_sol.solve_time) + "s" +
               Color::RESET;
      });
      return greedy_sol;
    }

    log_lazy(LogLevel::BASIC, [] {
      return Color::YELLOW + "Phase 1 (Greedy): failed, trying MIP..." +
             Color::RESET;
    });

    // ─── Phase 2: HiGHS MIP 精确求解 ───
    auto mip_start = chrono::steady_clock::now();

    // 2. 构建 MIP 模型
    Highs highs;
    setupSolver_(highs);

    // 变量索引映射
    unordered_map<Address, int> row_var_idx;
    unordered_map<pair<Address, int>, int, PairHash> col_var_idx;

    int num_vars = (int)failed_rows.size() + (int)unique_col_group_pairs.size();
    vector<double> costs(num_vars, feasibility_only_ ? 0.0 : 1.0);
    vector<double> lower(num_vars, 0.0);
    vector<double> upper(num_vars, 1.0);

    // 2.1 注册行变量
    int current_idx = 0;
    for (Address r : failed_rows) {
      row_var_idx[r] = current_idx++;
    }

    // 2.2 注册列变量
    for (const auto &pr : unique_col_group_pairs) {
      col_var_idx[pr] = current_idx++;
    }

    highs.addCols(num_vars, costs.data(), lower.data(), upper.data(), 0, NULL,
                  NULL, NULL);
    for (int i = 0; i < num_vars; ++i) {
      highs.changeColIntegrality(i, HighsVarType::kInteger);
    }

    // 2.4 批量添加覆盖约束
    {
      vector<double> rowLower_cov, rowUpper_cov;
      vector<int> astart_cov;
      vector<int> aindex_cov;
      vector<double> avalue_cov;
      astart_cov.reserve(tfs.size() + 1);
      int nnz = 0;

      for (const auto &f : tfs) {
        astart_cov.push_back(nnz);

        // A. 行变量
        auto rit = row_var_idx.find(f.row);
        if (rit != row_var_idx.end()) {
          aindex_cov.push_back(rit->second);
          avalue_cov.push_back(1.0);
          nnz++;
        }

        // B. 列变量
        auto cache_key = make_pair(f.col, f.row);
        const auto &valid_groups = group_cache[cache_key];
        for (int g : valid_groups) {
          auto cit = col_var_idx.find({f.col, g});
          if (cit != col_var_idx.end()) {
            aindex_cov.push_back(cit->second);
            avalue_cov.push_back(1.0);
            nnz++;
          }
        }

        rowLower_cov.push_back(1.0);
        rowUpper_cov.push_back(kHighsInf);
      }
      astart_cov.push_back(nnz);

      int num_cov_rows = (int)tfs.size();
      if (num_cov_rows > 0) {
        highs.addRows(num_cov_rows, rowLower_cov.data(), rowUpper_cov.data(),
                      nnz, astart_cov.data(), aindex_cov.data(),
                      avalue_cov.data());
      }
    }

    // 2.5 批量添加容量约束
    {
      vector<double> rowLower_cap, rowUpper_cap;
      vector<int> astart_cap;
      vector<int> aindex_cap;
      vector<double> avalue_cap;
      int nnz = 0;

      // Row Capacity
      if (!failed_rows.empty()) {
        astart_cap.push_back(nnz);
        for (auto &[r, idx] : row_var_idx) {
          aindex_cap.push_back(idx);
          avalue_cap.push_back(1.0);
          nnz++;
        }
        rowLower_cap.push_back(-kHighsInf);
        rowUpper_cap.push_back(getGroupCapacity(0));
      }

      // Column Group Capacity
      for (int g = 1; g < allGroupCnt_; ++g) {
        vector<int> indices;
        for (auto &[key, idx] : col_var_idx) {
          if (key.second == g) {
            indices.push_back(idx);
          }
        }

        if (!indices.empty()) {
          astart_cap.push_back(nnz);
          for (int idx : indices) {
            aindex_cap.push_back(idx);
            avalue_cap.push_back(1.0);
            nnz++;
          }
          rowLower_cap.push_back(-kHighsInf);
          rowUpper_cap.push_back(getGroupCapacity(g));
        }
      }

      astart_cap.push_back(nnz);

      int num_cap_rows = (int)rowLower_cap.size();
      if (num_cap_rows > 0) {
        highs.addRows(num_cap_rows, rowLower_cap.data(), rowUpper_cap.data(),
                      nnz, astart_cap.data(), aindex_cap.data(),
                      avalue_cap.data());
      }
    }

    // 3. 求解
    log_lazy(LogLevel::BASIC, [] {
      return Color::BOLD + Color::YELLOW + "Solving Set Cover Model..." +
             Color::RESET;
    });
    HighsStatus status = highs.run();

    auto mip_end = chrono::steady_clock::now();
    double mip_time = chrono::duration<double>(mip_end - mip_start).count();
    double total_time = chrono::duration<double>(mip_end - total_start).count();

    // 4. 解析结果
    if (status == HighsStatus::kOk) {
      result = parseSolution_(highs, fails, row_var_idx, col_var_idx,
                              row_to_fails, col_to_fails, group_cache);
    } else {
      result.feasible = false;
      result.solver_status = "Solver failed";
    }
    result.solve_time = total_time;
    result.greedy_time = greedy_elapsed;
    result.mip_time = mip_time;
    result.solved_by = result.feasible ? SolvedBy::HIGHS : SolvedBy::NONE;

    log_lazy(LogLevel::BASIC, [&] {
      return "Greedy time: " + to_string(greedy_elapsed) +
             "s, HiGHS time: " + to_string(mip_time) +
             "s, Total time: " + to_string(total_time) + "s";
    });

    return result;
  }

  void printSolution(const RepairSolution &sol, const set<Address2D_> &fails,
                     bool verbose = false, ostream &os = cout) const {
    if (!sol.feasible) {
      os << Color::ERROR_COLOR << "\n═══ INFEASIBLE ═══" << Color::RESET
         << endl;
      return;
    }

    os << Color::SUCCESS_COLOR << "\n═══ "
       << (sol.solver_status.empty() ? "SOLUTION" : sol.solver_status) << " ═══"
       << Color::RESET << endl;
    os << "Total lines used: " << sol.objective_value << " (Time: " << fixed
       << setprecision(3) << sol.solve_time << "s)\n\n";

    int row_used = sol.group_usage.count(0) ? sol.group_usage.at(0) : 0;
    int lcr_used = 0, ccr_used = 0;
    for (auto &[g, cnt] : sol.group_usage) {
      if (g >= lcrOffset_ && g < ccrOffset_)
        lcr_used += cnt;
      else if (g >= ccrOffset_)
        ccr_used += cnt;
    }

    os << "【Statistics】\n";
    os << "  Solved by:       " << sol.solvedByStr() << "\n";
    os << "  Row Redundancy:  " << row_used << " lines\n";
    os << "  LCR Redundancy:  " << lcr_used << " lines\n";
    os << "  CCR Redundancy:  " << ccr_used << " lines\n";
    os << "【Time Breakdown】\n";
    os << "  Greedy (Phase1): " << fixed << setprecision(3)
       << sol.greedy_time * 1000 << " ms\n";
    os << "  HiGHS  (Phase2): " << fixed << setprecision(3)
       << sol.mip_time * 1000 << " ms\n";
    os << "  Total:           " << fixed << setprecision(3)
       << sol.solve_time * 1000 << " ms\n";

    if (!verbose)
      return;

    os << endl;

    if (!sol.row_repairs.empty()) {
      os << Color::ROW_COLOR << Color::BOLD << "【Row Repairs】" << Color::RESET
         << endl;
      for (auto &[row, cols] : sol.row_repairs) {
        os << "  Row " << setw(3) << row << " (Group 0) repairs " << cols.size()
           << " fails: ";
        for (auto c : cols)
          os << "(" << row << "," << c << ") ";
        os << endl;
      }
      os << endl;
    }

    if (!sol.col_repairs.empty()) {
      os << Color::CCR_COLOR << Color::BOLD << "【Column Repairs】"
         << Color::RESET << endl;
      for (auto &[col, rows] : sol.col_repairs) {
        string group_names;
        if (sol.col_strategies.count(col)) {
          for (const string &name : sol.col_strategies.at(col)) {
            group_names += name + " ";
          }
        } else {
          group_names = "Unknown ";
        }

        os << "  Col " << setw(3) << col << " (" << group_names << ") repairs "
           << rows.size() << " fails: ";
        for (auto r : rows)
          os << "(" << r << "," << col << ") ";
        os << endl;
      }
    }

    os << "\n【Group Usage】" << endl;
    for (int g = 0; g < allGroupCnt_; ++g) {
      int used = sol.getUsageOf(g);
      if (used > 0) {
        os << "  Group " << setw(2) << g << " (" << setw(12)
           << repairGroups_[g].name << "): " << used << "/"
           << getGroupCapacity(g) << endl;
      }
    }
  }

  int getGroupCapacity(int group_id) const {
    return (group_id >= 0 && group_id < (int)repairGroups_.size())
               ? repairGroups_[group_id].count
               : 0;
  }

protected:
  // 配置参数
  int sectionCnt_;
  int colSeg_;
  int bigSectionCnt_;
  int regionCnt_;
  int rowGroupCnt_;
  int lcrGroupCnt_;
  int ccrGroupCnt_;
  int allGroupCnt_;
  vector<int> cpAddr_;

  // getBigSectionIdx_ 参数化
  uint32_t sectionGroupSize_;    // 原硬编码 2048
  uint32_t subsectionSize_;      // 原硬编码 344
  uint32_t subsectionsPerGroup_; // 原硬编码 6

  int rowOffset_;
  int lcrOffset_;
  int ccrOffset_;
  vector<RepairGroupInfo> repairGroups_;
  LogLevel log_level_;
  bool feasibility_only_;

  // 快速预检：O(n) 判定必然不可行
  PreCheckResult
  preCheck_(const set<Address> &failed_rows,
            const set<pair<Address, int>> &unique_col_group_pairs) const {
    int row_cap = getGroupCapacity(0);

    // 统计每个 col group 的需求量
    map<int, int> group_demand;
    for (const auto &pr : unique_col_group_pairs) {
      group_demand[pr.second]++;
    }

    // 计算 col group 总容量
    int total_col_cap = 0;
    for (int g = 1; g < allGroupCnt_; g++) {
      total_col_cap += getGroupCapacity(g);
    }

    // Rule A: unique rows > row_cap + total_col_cap
    // 每个 unique row 至少需要一个修复动作（行修复或列修复）
    // 行修复最多 row_cap 个, 列修复最多 total_col_cap 个（每个修复一列，
    // 可以"拯救"最多1个row不用行修复），总数不够则必然不可行
    if ((int)failed_rows.size() > row_cap + total_col_cap) {
      return {true, "unique rows (" + to_string(failed_rows.size()) +
                        ") > row_cap+col_cap (" +
                        to_string(row_cap + total_col_cap) + ")"};
    }

    // Rule B: col group 溢出累计 > row_cap
    // 对每个 col group g，如果 demand_g > cap_g，
    // 则 (demand_g - cap_g) 列无法被 group g 的列修复服务，
    // 这些列的所有 fail 都必须被行修复覆盖。
    // 如果溢出列总数 > row_cap，即使全部行修复也不够。
    int overflow_cols = 0;
    for (const auto &kv : group_demand) {
      int cap = getGroupCapacity(kv.first);
      if (kv.second > cap) {
        overflow_cols += (kv.second - cap);
      }
    }
    if (overflow_cols > row_cap) {
      return {true, "col group overflow (" + to_string(overflow_cols) +
                        " cols) > row_cap (" + to_string(row_cap) + ")"};
    }

    return {false, ""};
  }

  void finalizeConfig() {
    bigSectionCnt_ = sectionCnt_ / colSeg_;
    lcrGroupCnt_ = bigSectionCnt_ * regionCnt_;
    allGroupCnt_ = rowGroupCnt_ + lcrGroupCnt_ + ccrGroupCnt_;
    buildRepairGroups_();
  }

  void buildRepairGroups_() {
    repairGroups_.clear();
    rowOffset_ = 0;
    repairGroups_.push_back(
        {128, RedundancyType::ROW_RED, "Global Row", "", Color::ROW_COLOR});

    lcrOffset_ = 1;
    for (int i = 0; i < lcrGroupCnt_; i++) {
      repairGroups_.push_back({1, RedundancyType::LCR_RED, "LCR" + to_string(i),
                               "", Color::LCR_COLOR});
    }

    ccrOffset_ = lcrOffset_ + lcrGroupCnt_;
    for (int s = 0; s < bigSectionCnt_; s++) {
      for (int i = 0; i < 8; i++) {
        int id = s * 8 + i;
        repairGroups_.push_back({2, RedundancyType::CCR_RED,
                                 "CCR" + to_string(id), "", Color::CCR_COLOR});
      }
    }
  }

  int getCP_(int addr) const {
    auto it = upper_bound(cpAddr_.begin(), cpAddr_.end(), addr);
    if (it == cpAddr_.begin())
      return -1;
    return (int)distance(cpAddr_.begin(), it) - 1;
  }

  int addr2CP_(int col_addr) const { return getCP_(col_addr); }

  int addr2Csl_(int col_addr) const {
    int cp = getCP_(col_addr);
    if (cp < 0 || cp >= (int)cpAddr_.size() - 1)
      return 0;
    return col_addr - cpAddr_[cp];
  }

  int getBigSectionIdx_(int addr_x) const {
    uint32_t sectionGroupIdx = (uint32_t)addr_x / sectionGroupSize_;
    uint32_t subInGrpOffset =
        ((uint32_t)addr_x % sectionGroupSize_) / subsectionSize_ +
        sectionGroupIdx * subsectionsPerGroup_;
    return (int)(subInGrpOffset / colSeg_);
  }

  void setupSolver_(Highs &highs) {
    highs.setOptionValue("output_flag", false);
    highs.setOptionValue("presolve", "on");

    // ─ MIP 速度 vs 质量权衡 ─
    // 允许 5% 相对 gap：解 ≤ 最优值 × 1.05 即停止
    highs.setOptionValue("mip_rel_gap", 0.05);
    // 允许绝对 gap 2：解 ≤ 最优值 + 2 即停止（对小规模问题更有效）
    highs.setOptionValue("mip_abs_gap", 2.0);
    // 超时 10 秒：防止极端 case 卡死，到时返回当前最佳可行解
    highs.setOptionValue("time_limit", 10.0);
  }

private:
  // ─── repairMost 贪心启发式 ───
  // 策略：每轮选择能覆盖最多未修复 fail 的动作（行修复 or 列-组修复），
  // 直到所有 fail 被覆盖（成功）或无合法动作（失败）
  RepairSolution
  quickSolve_(const set<Address2D_> &tfs, const set<Address> &failed_rows,
              const map<Address, vector<Address2D_>> &row_to_fails,
              const map<Address, vector<Address2D_>> &col_to_fails,
              const unordered_map<pair<Address, Address>, vector<int>, PairHash>
                  &group_cache,
              const set<pair<Address, int>> &unique_col_group_pairs) {

    RepairSolution sol;
    sol.feasible = false;

    // 剩余容量表
    map<int, int> remaining_cap;
    remaining_cap[0] = getGroupCapacity(0); // row group
    for (int g = 1; g < allGroupCnt_; ++g) {
      remaining_cap[g] = getGroupCapacity(g);
    }

    // 未覆盖的 fail 集合
    set<Address2D_> uncovered(tfs.begin(), tfs.end());

    // 已选择的行修复
    set<Address> selected_rows;
    // 已选择的 (col, group) 修复
    set<pair<Address, int>> selected_col_groups;

    while (!uncovered.empty()) {
      // ─ 候选 1：行修复 ─
      Address best_row = -1;
      int best_row_cover = 0;
      if (remaining_cap[0] > 0) {
        for (Address r : failed_rows) {
          if (selected_rows.count(r))
            continue;
          int cover = 0;
          auto it = row_to_fails.find(r);
          if (it != row_to_fails.end()) {
            for (const auto &f : it->second) {
              if (uncovered.count(f))
                cover++;
            }
          }
          if (cover > best_row_cover) {
            best_row_cover = cover;
            best_row = r;
          }
        }
      }

      // ─ 候选 2：列-组修复 ─
      pair<Address, int> best_cg = {-1, -1};
      int best_cg_cover = 0;
      for (const auto &cg : unique_col_group_pairs) {
        if (selected_col_groups.count(cg))
          continue;
        int g = cg.second;
        if (remaining_cap[g] <= 0)
          continue;

        Address col = cg.first;
        int cover = 0;
        auto cit = col_to_fails.find(col);
        if (cit != col_to_fails.end()) {
          for (const auto &f : cit->second) {
            if (!uncovered.count(f))
              continue;
            // 确认此 fail 可被此 group 修复
            auto gc_key = make_pair(f.col, f.row);
            auto gc_it = group_cache.find(gc_key);
            if (gc_it != group_cache.end()) {
              for (int vg : gc_it->second) {
                if (vg == g) {
                  cover++;
                  break;
                }
              }
            }
          }
        }
        if (cover > best_cg_cover) {
          best_cg_cover = cover;
          best_cg = cg;
        }
      }

      // ─ 选择覆盖最多的动作 ─
      if (best_row_cover == 0 && best_cg_cover == 0) {
        // 无法继续覆盖 → 失败
        return sol;
      }

      // 优化策略：当覆盖数相同时，优先选择由 Column Group 修复
      // 原因：Row Repair 是全局资源（Group 0，容量有限且共享），
      // 而 Column Group 是局部资源（分散在各个 Group）。
      // 优先消耗局部资源，保留全局资源作为 fallback，可以处理更多冲突（如 CCR
      // Group 满的情况）。
      if (best_row_cover > best_cg_cover && best_row >= 0) {
        // 选择行修复
        selected_rows.insert(best_row);
        remaining_cap[0]--;
        sol.group_usage[0]++;
        sol.row_repairs[best_row] = {};
        auto it = row_to_fails.find(best_row);
        if (it != row_to_fails.end()) {
          for (const auto &f : it->second) {
            if (uncovered.erase(f)) {
              sol.row_repairs[best_row].push_back(f.col);
              sol.assignments.push_back({f, "RowRepair"});
            }
          }
        }
      } else {
        // 选择列-组修复
        Address col = best_cg.first;
        int g = best_cg.second;
        selected_col_groups.insert(best_cg);
        remaining_cap[g]--;
        sol.group_usage[g]++;
        sol.col_strategies[col].insert(repairGroups_[g].name);

        if (sol.col_repairs.find(col) == sol.col_repairs.end()) {
          sol.col_repairs[col] = {};
        }

        auto cit = col_to_fails.find(col);
        if (cit != col_to_fails.end()) {
          for (const auto &f : cit->second) {
            if (!uncovered.count(f))
              continue;
            auto gc_key = make_pair(f.col, f.row);
            auto gc_it = group_cache.find(gc_key);
            if (gc_it != group_cache.end()) {
              for (int vg : gc_it->second) {
                if (vg == g) {
                  uncovered.erase(f);
                  sol.col_repairs[col].push_back(f.row);
                  sol.assignments.push_back({f, repairGroups_[g].name});
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 全部覆盖
    sol.feasible = true;
    int total = 0;
    for (auto &[g, cnt] : sol.group_usage)
      total += cnt;
    sol.objective_value = total;
    return sol;
  }

private:
  RepairSolution parseSolution_(
      const Highs &highs, const set<Address2D_> &fails,
      const unordered_map<Address, int> &row_var_idx,
      const unordered_map<pair<Address, int>, int, PairHash> &col_var_idx,
      const map<Address, vector<Address2D_>> &row_to_fails,
      const map<Address, vector<Address2D_>> &col_to_fails,
      const unordered_map<pair<Address, Address>, vector<int>, PairHash>
          &group_cache) {
    RepairSolution sol;
    HighsModelStatus status = highs.getModelStatus();

    if (status != HighsModelStatus::kOptimal &&
        status != HighsModelStatus::kSolutionLimit) {
      sol.feasible = false;
      sol.solver_status =
          (status == HighsModelStatus::kInfeasible) ? "Infeasible" : "Other";
      return sol;
    }

    sol.feasible = true;
    sol.solver_status =
        (status == HighsModelStatus::kOptimal) ? "Optimal" : "Limit";
    sol.objective_value = highs.getInfo().objective_function_value;

    const auto &solution = highs.getSolution();
    const vector<double> &col_vals = solution.col_value;

    // 1. 解析行修复
    set<Address> rows_repaired_by_row_red;
    for (auto &[row, idx] : row_var_idx) {
      if (idx < (int)col_vals.size() && col_vals[idx] > 0.5) {
        sol.group_usage[0]++;
        rows_repaired_by_row_red.insert(row);

        sol.row_repairs[row] = {};
        for (auto &f : row_to_fails.at(row)) {
          sol.row_repairs[row].push_back(f.col);
          sol.assignments.push_back({f, "RowRepair"});
        }
      }
    }

    // 2. 解析列修复
    for (auto &[key, idx] : col_var_idx) {
      Address col = key.first;
      int group = key.second;

      if (idx < (int)col_vals.size() && col_vals[idx] > 0.5) {
        sol.group_usage[group]++;
        sol.col_strategies[col].insert(repairGroups_[group].name);

        if (sol.col_repairs.find(col) == sol.col_repairs.end()) {
          sol.col_repairs[col] = {};
        }

        for (auto &f : col_to_fails.at(col)) {
          if (rows_repaired_by_row_red.count(f.row))
            continue;

          auto cache_key = make_pair(f.col, f.row);
          auto cit = group_cache.find(cache_key);
          if (cit != group_cache.end()) {
            bool can_fix = false;
            for (int vg : cit->second) {
              if (vg == group) {
                can_fix = true;
                break;
              }
            }
            if (can_fix) {
              sol.col_repairs[col].push_back(f.row);
              sol.assignments.push_back({f, repairGroups_[group].name});
            }
          }
        }
      }
    }

    // 用实际使用量覆盖 objective_value（feasibility_only 模式时 HiGHS 返回 0）
    sol.objective_value = sol.getTotalUsed();

    return sol;
  }
};

// ============================================================
// OP-1a
// ============================================================
class RepairOp1a : public DramRepairSolver {
public:
  string getName() override { return "OP-1a"; }

  RepairOp1a() : DramRepairSolver() {
    sectionCnt_ = 48;
    colSeg_ = 2;
    regionCnt_ = 4;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * 8;
    finalizeConfig();
  }

  Address2D_ transAddr_(Address2D_ addr) override {
    Address2D_ a;
    a.row = addr.row;
    int cp = addr2CP_(addr.col);
    int csl = addr2Csl_(addr.col);
    if (csl < 48) {
      a.col = addr.col;
    } else {
      // CP=8/9 走CCR修复，地址不变换
      if (cp == 8 || cp == 9) {
        a.col = addr.col;
        return a;
      }
      int fcp = getRegionFirstCp(cp);
      assert(fcp >= 0);
      a.col = cpAddr_[fcp] + csl;
    }
    return a;
  }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int cp = addr2CP_(col_addr);
    int csl = addr2Csl_(col_addr);
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    // CCR: csl < 48，或 cp==8/9（特殊），或 cp==17
    if (csl < 48 || cp == 17 || cp == 9 || cp == 8) {
      int ccr_idx = ccrOffset_ + big_section_idx * 8 + (csl % 8);
      if (ccr_idx >= ccrOffset_ && ccr_idx < ccrOffset_ + ccrGroupCnt_) {
        available.push_back(ccr_idx);
      }
    }
    // LCR: csl >= 48 且不是 cp==8/9/17
    else {
      int region = getCP2region(cp);
      if (region >= 0) {
        int lcr_idx = lcrOffset_ + big_section_idx * regionCnt_ + region;
        if (lcr_idx >= lcrOffset_ && lcr_idx < ccrOffset_) {
          available.push_back(lcr_idx);
        }
      }
    }
    return available;
  }

private:
  int getRegionFirstCp(int cp) const {
    if (0 <= cp && cp <= 3)
      return 0;
    if (4 <= cp && cp <= 7)
      return 4;
    if (10 <= cp && cp <= 13)
      return 10;
    if (14 <= cp && cp <= 18)
      return 14;
    return -1;
  }

  int getCP2region(int cp) const {
    if (0 <= cp && cp <= 3)
      return 0;
    if (4 <= cp && cp <= 7)
      return 1;
    if (10 <= cp && cp <= 13)
      return 2;
    if (14 <= cp && cp <= 18)
      return 3;
    // cp==8/9 不走LCR，不应到达这里
    return -1;
  }
};

// ============================================================
// OP-1b
// ============================================================
class RepairOp1b : public DramRepairSolver {
public:
  string getName() override { return "OP-1b"; }

  RepairOp1b() : DramRepairSolver() {
    sectionCnt_ = 48;
    colSeg_ = 2;
    regionCnt_ = 4;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * 8;
    finalizeConfig();
  }

  Address2D_ transAddr_(Address2D_ addr) override {
    Address2D_ a;
    a.row = addr.row;
    int cp = addr2CP_(addr.col);
    int csl = addr2Csl_(addr.col);
    if (csl < 48) {
      a.col = addr.col;
    } else {
      int fcp = getRegionFirstCp(cp);
      assert(fcp >= 0);
      a.col = cpAddr_[fcp] + csl;
    }
    return a;
  }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int cp = addr2CP_(col_addr);
    int csl = addr2Csl_(col_addr);
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    if (csl < 48 || cp == 17) {
      int ccr_idx = ccrOffset_ + big_section_idx * 8 + (csl % 8);
      if (ccr_idx >= ccrOffset_ && ccr_idx < ccrOffset_ + ccrGroupCnt_) {
        available.push_back(ccr_idx);
      }
    } else {
      int region = getCP2region(cp);
      if (region >= 0) {
        int lcr_idx = lcrOffset_ + big_section_idx * regionCnt_ + region;
        if (lcr_idx >= lcrOffset_ && lcr_idx < ccrOffset_) {
          available.push_back(lcr_idx);
        }
      }
    }
    return available;
  }

protected:
  virtual int getRegionFirstCp(int cp) const {
    if (0 <= cp && cp <= 4)
      return 0;
    if (5 <= cp && cp <= 8)
      return 5;
    if (9 <= cp && cp <= 13)
      return 9;
    if (14 <= cp && cp <= 18)
      return 14;
    return -1;
  }

  virtual int getCP2region(int cp) const {
    if (0 <= cp && cp <= 4)
      return 0;
    if (5 <= cp && cp <= 8)
      return 1;
    if (9 <= cp && cp <= 13)
      return 2;
    if (14 <= cp && cp <= 18)
      return 3;
    return -1;
  }
};

// ============================================================
// OP-1c
// ============================================================
class RepairOp1c : public DramRepairSolver {
public:
  string getName() override { return "OP-1c"; }

  RepairOp1c() : DramRepairSolver() {
    sectionCnt_ = 48;
    colSeg_ = 2;
    regionCnt_ = 5;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * 8;
    finalizeConfig();
  }

  Address2D_ transAddr_(Address2D_ addr) override {
    Address2D_ a;
    a.row = addr.row;
    int cp = addr2CP_(addr.col);
    int csl = addr2Csl_(addr.col);
    if (csl < 48) {
      a.col = addr.col;
    } else {
      int fcp = getRegionFirstCp(cp);
      assert(fcp >= 0);
      a.col = cpAddr_[fcp] + csl;
    }
    return a;
  }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int cp = addr2CP_(col_addr);
    int csl = addr2Csl_(col_addr);
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    if (csl < 48 || cp == 17) {
      int ccr_idx = ccrOffset_ + big_section_idx * 8 + (csl % 8);
      if (ccr_idx >= ccrOffset_ && ccr_idx < ccrOffset_ + ccrGroupCnt_) {
        available.push_back(ccr_idx);
      }
    } else if (csl >= 48) {
      int region = getCP2region(cp);
      if (region >= 0) {
        int lcr_idx = lcrOffset_ + big_section_idx * regionCnt_ + region;
        if (lcr_idx >= lcrOffset_ && lcr_idx < ccrOffset_) {
          available.push_back(lcr_idx);
        }
      }
    }
    return available;
  }

protected:
  virtual int getRegionFirstCp(int cp) const {
    if (0 <= cp && cp <= 3)
      return 0;
    if (4 <= cp && cp <= 7)
      return 4;
    if ((8 <= cp && cp <= 9) || cp == 18)
      return 8;
    if (10 <= cp && cp <= 13)
      return 10;
    if (14 <= cp && cp <= 17)
      return 14;
    return -1;
  }

  virtual int getCP2region(int cp) const {
    if (0 <= cp && cp <= 3)
      return 0;
    if (4 <= cp && cp <= 7)
      return 1;
    if ((8 <= cp && cp <= 9) || cp == 18)
      return 2;
    if (10 <= cp && cp <= 13)
      return 3;
    if (14 <= cp && cp <= 17)
      return 4;
    return -1;
  }
};

// ============================================================
// OP-1d: 继承 OP-1b 逻辑，仅改 colSeg=1
// ============================================================
class RepairOp1d : public RepairOp1b {
public:
  string getName() override { return "OP-1d"; }

  RepairOp1d() : RepairOp1b() {
    colSeg_ = 1;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * 8;
    finalizeConfig();
  }
};

// ============================================================
// OP-1e: 继承 OP-1c 逻辑，仅改 colSeg=1
// ============================================================
class RepairOp1e : public RepairOp1c {
public:
  string getName() override { return "OP-1e"; }

  RepairOp1e() : RepairOp1c() {
    colSeg_ = 1;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * 8;
    finalizeConfig();
  }
};

// ============================================================
// OP-3: 每个CP独立LCR，无CCR
// ============================================================
class RepairOp3 : public DramRepairSolver {
public:
  string getName() override { return "OP-3"; }

  RepairOp3() : DramRepairSolver() {
    sectionCnt_ = 48;
    colSeg_ = 2;
    regionCnt_ = 19; // CP 0~18，共19个
    ccrGroupCnt_ = 0;
    finalizeConfig();
  }

  Address2D_ transAddr_(Address2D_ addr) override { return addr; }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int cp = addr2CP_(col_addr);
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    int lcr_idx = lcrOffset_ + big_section_idx * regionCnt_ + cp;
    if (lcr_idx >= lcrOffset_ && lcr_idx < lcrOffset_ + lcrGroupCnt_) {
      available.push_back(lcr_idx);
    }

    return available;
  }

  void buildRepairGroups_() {
    repairGroups_.clear();
    rowOffset_ = 0;
    repairGroups_.push_back(
        {128, RedundancyType::ROW_RED, "Global Row", "", Color::ROW_COLOR});

    lcrOffset_ = 1;
    for (int i = 0; i < lcrGroupCnt_; i++) {
      repairGroups_.push_back({3, RedundancyType::LCR_RED, "LCR" + to_string(i),
                               "", Color::LCR_COLOR});
    }

    ccrOffset_ = lcrOffset_ + lcrGroupCnt_;
    for (int s = 0; s < bigSectionCnt_; s++) {
      for (int i = 0; i < 8; i++) {
        int id = s * 8 + i;
        repairGroups_.push_back({2, RedundancyType::CCR_RED,
                                 "CCR" + to_string(id), "", Color::CCR_COLOR});
      }
    }
  }
};
// ============================================================
// CommonLCRDevice: 标准 LCR 设备（仅 LCR，无 CCR）
// 地址压缩规则（参照 OP-1b）：
//   1. CP 数量 = maxColAddr / 64
//   2. 每 cpsPerRegion（默认4）个 CP 压缩到同一 Region
//   3. transAddr_ 将同一 Region 内不同 CP 的地址折叠到首 CP
// ============================================================
class CommonLCRDevice : public DramRepairSolver {
public:
  string getName() override { return "Common LCR Device"; }

  /// @param maxColAddr    最大列地址（用于计算 CP 数量）
  /// @param maxRowAddr    最大行地址
  /// @param cpsPerRegion  每个 Region 包含的 CP 数（默认 4，即 4 个 CP
  /// 压缩到一起）
  /// @param lcrCapacity   每个 LCR group 的容量
  /// @param rowCapacity   全局 Row 修复容量
  /// @param sectionCount  Section 总数
  /// @param colSegment    colSeg（几个 section 合并为一个 big section）
  CommonLCRDevice(int maxColAddr = 1024, int maxRowAddr = 2048,
                  int cpsPerRegion = 4, int lcrCapacity = 1,
                  int rowCapacity = 128, int sectionCount = 48,
                  int colSegment = 2)
      : DramRepairSolver(), maxColAddr_(maxColAddr), maxRowAddr_(maxRowAddr),
        cpsPerRegion_(cpsPerRegion), lcrCapacity_(lcrCapacity),
        rowCapacity_(rowCapacity) {
    sectionCnt_ = sectionCount;
    colSeg_ = colSegment;

    // CP 数量 = maxColAddr / 64
    cpCount_ = maxColAddr_ / 64;
    if (cpCount_ <= 0)
      cpCount_ = 1;

    // Region 数量 = ceil(cpCount / cpsPerRegion)
    regionCnt_ = (cpsPerRegion_ > 0)
                     ? ((cpCount_ + cpsPerRegion_ - 1) / cpsPerRegion_)
                     : 1;

    ccrGroupCnt_ = 0; // 无 CCR
    rebuildConfig_();
  }

  // ─── 地址压缩（参照 OP-1b 的 transAddr_）───
  // 同一个 Region 内不同 CP 的地址折叠到该 Region 首 CP 的位置
  // 原理：cp = col_addr / 64, region = cp / cpsPerRegion
  //        firstCp = region * cpsPerRegion
  //        compressed_addr = firstCp * 64 + (col_addr % 64)
  Address2D_ transAddr_(Address2D_ addr) override {
    Address2D_ a;
    a.row = addr.row;

    int cp = addr.col / 64;
    int csl = addr.col % 64; // CSL 偏移（CP 内偏移）
    int region = (cpsPerRegion_ > 0) ? (cp / cpsPerRegion_) : 0;
    if (region >= regionCnt_)
      region = regionCnt_ - 1;
    int firstCp = region * cpsPerRegion_;

    // 将地址折叠到 region 首 CP 的基地址 + CSL 偏移
    a.col = firstCp * 64 + csl;
    return a;
  }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    // 通过 CP 编号计算 Region
    int cp = col_addr / 64;
    int region = (cpsPerRegion_ > 0) ? (cp / cpsPerRegion_) : 0;
    if (region >= regionCnt_)
      region = regionCnt_ - 1;
    if (region < 0)
      region = 0;

    int lcr_idx = lcrOffset_ + big_section_idx * regionCnt_ + region;
    if (lcr_idx >= lcrOffset_ && lcr_idx < lcrOffset_ + lcrGroupCnt_) {
      available.push_back(lcr_idx);
    }

    return available;
  }

protected:
  const int maxColAddr_;
  const int maxRowAddr_;
  const int
      cpsPerRegion_; // 每个 Region 包含的 CP 数（原 cslPerRegion 改为 CP 粒度）
  const int lcrCapacity_;
  const int rowCapacity_;
  int cpCount_; // CP 总数 = maxColAddr / 64

private:
  void rebuildConfig_() {
    ccrGroupCnt_ = 0;
    finalizeConfig();
    if (!repairGroups_.empty()) {
      repairGroups_[0].count = rowCapacity_;
    }
    for (int i = lcrOffset_; i < ccrOffset_; i++) {
      repairGroups_[i].count = lcrCapacity_;
    }
  }
};

// ============================================================
// CommonCCRDevice: 标准 CCR 设备（仅 CCR，无 LCR）
// 固定规则：按 col_addr % ccrGroupsPerSection 分配
// ============================================================
class CommonCCRDevice : public DramRepairSolver {
public:
  string getName() override { return "Common CCR Device"; }

  CommonCCRDevice(int maxColAddr = 1024, int maxRowAddr = 2048,
                  int ccrGroupsPerSection = 8, int ccrCapacity = 2,
                  int rowCapacity = 128, int sectionCount = 48,
                  int colSegment = 2)
      : DramRepairSolver(), maxColAddr_(maxColAddr), maxRowAddr_(maxRowAddr),
        ccrGroupsPerSection_(ccrGroupsPerSection), ccrCapacity_(ccrCapacity),
        rowCapacity_(rowCapacity) {
    sectionCnt_ = sectionCount;
    colSeg_ = colSegment;
    regionCnt_ = 0;
    ccrGroupCnt_ = (sectionCnt_ / colSeg_) * ccrGroupsPerSection_;
    rebuildConfig_();
  }

  Address2D_ transAddr_(Address2D_ addr) override { return addr; }

  vector<int>
  getColAvailableGroups_(Address col_addr,
                         Address row_addr_for_section) const override {
    vector<int> available;
    int big_section_idx = getBigSectionIdx_(row_addr_for_section);

    int ccr_sub =
        (ccrGroupsPerSection_ > 0) ? (col_addr % ccrGroupsPerSection_) : 0;
    int ccr_idx = ccrOffset_ + big_section_idx * ccrGroupsPerSection_ + ccr_sub;
    if (ccr_idx >= ccrOffset_ && ccr_idx < ccrOffset_ + ccrGroupCnt_) {
      available.push_back(ccr_idx);
    }

    return available;
  }

protected:
  const int maxColAddr_;
  const int maxRowAddr_;
  const int ccrGroupsPerSection_;
  const int ccrCapacity_;
  const int rowCapacity_;

private:
  void rebuildConfig_() {
    lcrGroupCnt_ = 0;
    allGroupCnt_ = rowGroupCnt_ + ccrGroupCnt_;
    buildCCROnlyGroups_();
  }

  void buildCCROnlyGroups_() {
    repairGroups_.clear();
    rowOffset_ = 0;
    repairGroups_.push_back({rowCapacity_, RedundancyType::ROW_RED,
                             "Global Row", "", Color::ROW_COLOR});

    lcrOffset_ = 1;
    ccrOffset_ = 1;

    for (int s = 0; s < bigSectionCnt_; s++) {
      for (int i = 0; i < ccrGroupsPerSection_; i++) {
        int id = s * ccrGroupsPerSection_ + i;
        repairGroups_.push_back({ccrCapacity_, RedundancyType::CCR_RED,
                                 "CCR" + to_string(id), "", Color::CCR_COLOR});
      }
    }
  }
};

// ============================================================
// PureLCRProduct: 纯 LCR 产品，继承 CommonLCRDevice
// Row 配置仿照 OP-1a：sectionGroupSize=2048, subsectionSize=344,
//                     subsectionsPerGroup=6
// 参数关系：maxRowAddr == (sectionCnt / subsectionsPerGroup) * sectionGroupSize
// LCR Region 由 CommonLCRDevice 自动计算：
//   cpCount = maxColAddr / 64, regionCnt = cpCount / cpsPerRegion
// ============================================================
class PureLCRProduct : public CommonLCRDevice {
public:
  string getName() override { return "Pure LCR Product"; }

  PureLCRProduct(int maxColAddr = 1024, int maxRowAddr = 16384,
                 int cpsPerRegion = 2, int lcrCapacity = 2,
                 int rowCapacity = 128, int sectionCount = 48,
                 int colSegment = 2, uint32_t sectionGroupSize = 2048,
                 uint32_t subsectionSize = 344,
                 uint32_t subsectionsPerGroup = 6)
      : CommonLCRDevice(maxColAddr, maxRowAddr, cpsPerRegion, lcrCapacity,
                        rowCapacity, sectionCount, colSegment) {
    sectionGroupSize_ = sectionGroupSize;
    subsectionSize_ = subsectionSize;
    subsectionsPerGroup_ = subsectionsPerGroup;
    // regionCnt_ 已由 CommonLCRDevice 根据 cpCount/cpsPerRegion 自动计算

    // ─── 参数一致性校验 ───
    assert(subsectionsPerGroup_ > 0 && "subsectionsPerGroup must be > 0");
    assert(sectionGroupSize_ > 0 && "sectionGroupSize must be > 0");
    assert(sectionCnt_ % subsectionsPerGroup_ == 0 &&
           "sectionCnt must be divisible by subsectionsPerGroup");
    assert(sectionCnt_ % colSeg_ == 0 &&
           "sectionCnt must be divisible by colSeg");

    int numSectionGroups = sectionCnt_ / (int)subsectionsPerGroup_;
    int expectedMaxRowAddr = numSectionGroups * (int)sectionGroupSize_;
    assert(maxRowAddr_ == expectedMaxRowAddr &&
           "maxRowAddr must equal (sectionCnt/subsectionsPerGroup) * "
           "sectionGroupSize");
  }
};

// ============================================================
// PureCCRProduct: 纯 CCR 产品，继承 CommonCCRDevice
// Row 配置仿照 OP-1a：sectionGroupSize=2048, subsectionSize=344,
//                     subsectionsPerGroup=6
// 参数关系：maxRowAddr == (sectionCnt / subsectionsPerGroup) * sectionGroupSize
// ============================================================
class PureCCRProduct : public CommonCCRDevice {
public:
  string getName() override { return "Pure CCR Product"; }

  PureCCRProduct(int maxColAddr = 1024, int maxRowAddr = 16384,
                 int ccrGroupsPerSection = 8, int ccrCapacity = 2,
                 int rowCapacity = 128, int sectionCount = 48,
                 int colSegment = 2, uint32_t sectionGroupSize = 2048,
                 uint32_t subsectionSize = 344,
                 uint32_t subsectionsPerGroup = 6)
      : CommonCCRDevice(maxColAddr, maxRowAddr, ccrGroupsPerSection,
                        ccrCapacity, rowCapacity, sectionCount, colSegment) {
    sectionGroupSize_ = sectionGroupSize;
    subsectionSize_ = subsectionSize;
    subsectionsPerGroup_ = subsectionsPerGroup;

    // ─── 参数一致性校验 ───
    assert(subsectionsPerGroup_ > 0 && "subsectionsPerGroup must be > 0");
    assert(sectionGroupSize_ > 0 && "sectionGroupSize must be > 0");
    assert(sectionCnt_ % subsectionsPerGroup_ == 0 &&
           "sectionCnt must be divisible by subsectionsPerGroup");
    assert(sectionCnt_ % colSeg_ == 0 &&
           "sectionCnt must be divisible by colSeg");

    int numSectionGroups = sectionCnt_ / (int)subsectionsPerGroup_;
    int expectedMaxRowAddr = numSectionGroups * (int)sectionGroupSize_;
    assert(maxRowAddr_ == expectedMaxRowAddr &&
           "maxRowAddr must equal (sectionCnt/subsectionsPerGroup) * "
           "sectionGroupSize");
  }
};