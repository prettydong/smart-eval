#pragma once

#include <algorithm>
#include <climits>
#include <iostream>
#include <random>
#include <set>
#include <string>
#include <vector>

#ifndef ADDRESS2D_DEFINED_
#define ADDRESS2D_DEFINED_
using Address = int;
struct Address2D_ {
  Address row;
  Address col;
  void print() const { std::cout << "(" << row << ", " << col << ")"; }
  auto operator<=>(const Address2D_ &) const = default;
};
#endif

// ============================================================
// 测试用例配置
// ============================================================
struct TestCase {
  int sparseFailCount; // 散列故障个数
  int colLineFailCount; // 列线性故障（col line fail）条数，每条 LINE_FAIL_LEN
                        // 个 fail
  int rowLineFailCount; // 行线性故障（row line fail）条数，每条 LINE_FAIL_LEN
                        // 个 fail

  static constexpr int LINE_FAIL_LEN = 20; // 每条 line fail 包含的连续故障数

  int totalFails() const {
    return sparseFailCount + colLineFailCount * LINE_FAIL_LEN +
           rowLineFailCount * LINE_FAIL_LEN;
  }

  void print() const {
    std::cout << "─── Test Case ───\n"
              << "  Sparse fails:     " << sparseFailCount << "\n"
              << "  Col line fails:   " << colLineFailCount << " lines × "
              << LINE_FAIL_LEN << " = " << colLineFailCount * LINE_FAIL_LEN
              << " fails\n"
              << "  Row line fails:   " << rowLineFailCount << " lines × "
              << LINE_FAIL_LEN << " = " << rowLineFailCount * LINE_FAIL_LEN
              << " fails\n"
              << "  Total expected:   " << totalFails() << " fails\n"
              << "─────────────────\n";
  }
};

// ============================================================
// 故障生成器
// ============================================================
class FailGenerator {
public:
  FailGenerator(int maxRowAddr = 16384, int maxColAddr = 1024,
                unsigned seed = 42)
      : maxRowAddr_(maxRowAddr), maxColAddr_(maxColAddr), rng_(seed) {}

  // 根据测试用例生成故障集合
  std::set<Address2D_> generate(const TestCase &tc) {
    std::set<Address2D_> fails;

    // 1. 生成 col line fails（同一列，连续 LINE_FAIL_LEN 行）
    generateColLineFails_(fails, tc.colLineFailCount);

    // 2. 生成 row line fails（同一行，连续 LINE_FAIL_LEN 列）
    generateRowLineFails_(fails, tc.rowLineFailCount);

    // 3. 生成 sparse fails（随机散列）
    generateSparseFails_(fails, tc.sparseFailCount);

    return fails;
  }

  // 打印 fail 统计信息
  static void printStats(const std::set<Address2D_> &fails) {
    if (fails.empty()) {
      std::cout << "No fails generated.\n";
      return;
    }

    std::set<int> unique_rows, unique_cols;
    for (const auto &f : fails) {
      unique_rows.insert(f.row);
      unique_cols.insert(f.col);
    }

    std::cout << "═══ Fail Statistics ═══\n"
              << "  Total fails:   " << fails.size() << "\n"
              << "  Unique rows:   " << unique_rows.size() << "\n"
              << "  Unique cols:   " << unique_cols.size() << "\n"
              << "═══════════════════════\n";
  }

private:
  int maxRowAddr_;
  int maxColAddr_;
  std::mt19937 rng_;

  // 散列故障：随机 (row, col)
  void generateSparseFails_(std::set<Address2D_> &fails, int count) {
    std::uniform_int_distribution<int> row_dist(0, maxRowAddr_ - 1);
    std::uniform_int_distribution<int> col_dist(0, maxColAddr_ - 1);

    int added = 0;
    while (added < count) {
      auto [it, ok] = fails.insert({row_dist(rng_), col_dist(rng_)});
      if (ok)
        added++;
    }
  }

  // 列线性故障：固定一列，连续 LINE_FAIL_LEN 行
  void generateColLineFails_(std::set<Address2D_> &fails, int lineCount) {
    std::uniform_int_distribution<int> col_dist(0, maxColAddr_ - 1);
    std::uniform_int_distribution<int> row_start_dist(
        0, maxRowAddr_ - TestCase::LINE_FAIL_LEN);

    for (int i = 0; i < lineCount; i++) {
      int col = col_dist(rng_);
      int row_start = row_start_dist(rng_);
      for (int j = 0; j < TestCase::LINE_FAIL_LEN; j++) {
        fails.insert({row_start + j, col});
      }
    }
  }

  // 行线性故障：固定一行，连续 LINE_FAIL_LEN 列
  void generateRowLineFails_(std::set<Address2D_> &fails, int lineCount) {
    std::uniform_int_distribution<int> row_dist(0, maxRowAddr_ - 1);
    std::uniform_int_distribution<int> col_start_dist(
        0, maxColAddr_ - TestCase::LINE_FAIL_LEN);

    for (int i = 0; i < lineCount; i++) {
      int row = row_dist(rng_);
      int col_start = col_start_dist(rng_);
      for (int j = 0; j < TestCase::LINE_FAIL_LEN; j++) {
        fails.insert({row, col_start + j});
      }
    }
  }
};
