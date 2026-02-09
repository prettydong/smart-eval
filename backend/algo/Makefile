# ==========================================
# Makefile for C++ Project with HiGHS Solver
# ==========================================

# 1. 配置编译器和标准
CXX      := g++
CXXFLAGS := -std=c++20 -O3 -Wall -Wextra

# 2. HiGHS 路径配置
# 使用本地编译的 HiGHS (在 third_party/highs-install)
HIGHS_INSTALL_DIR := $(shell pwd)/third_party/highs-install

# 3. fmt 库路径配置
FMT_INSTALL_DIR := $(shell pwd)/third_party/fmt-install

# 包含路径和库路径
CXXFLAGS += -Isrc -I$(HIGHS_INSTALL_DIR)/include -I$(HIGHS_INSTALL_DIR)/include/highs
CXXFLAGS += -I$(FMT_INSTALL_DIR)/include
LDFLAGS  += -L$(HIGHS_INSTALL_DIR)/lib -lhighs -Wl,-rpath,$(HIGHS_INSTALL_DIR)/lib
LDFLAGS  += -L$(FMT_INSTALL_DIR)/lib -lfmt

# 3. 项目目录
OUTPUT_DIR := output
TARGET     := $(OUTPUT_DIR)/repair_solver
SRCS       := src/main.cpp src/repairRegion.cpp
# 将 src/path/to/file.cpp 转换为 output/file.o
OBJS       := $(patsubst src/%.cpp, $(OUTPUT_DIR)/%.o, $(SRCS))

# 4. 编译规则
.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) -o $(TARGET) $(LDFLAGS)

$(OUTPUT_DIR)/%.o: src/%.cpp
	@mkdir -p $(OUTPUT_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

# 5. 辅助功能
clean:
	rm -rf $(OUTPUT_DIR)

run: all
	./$(TARGET)
