package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// ProductConfig 产品架构配置
type ProductConfig struct {
	Name string `json:"name"` // 配置名称 (唯一标识)

	// 模式
	Mode string `json:"mode"` // "lcr" | "ccr"

	// 地址空间
	MaxRow int `json:"maxrow"`
	MaxCol int `json:"maxcol"`

	// 求解器通用参数
	RowCap              int `json:"rowcap"`
	SectionCnt          int `json:"sectioncnt"`
	ColSeg              int `json:"colseg"`
	SectionGroupSize    int `json:"sectionGroupSize"`
	SubsectionSize      int `json:"subsectionSize"`
	SubsectionsPerGroup int `json:"subsectionsPerGroup"`

	// LCR 专用
	CpsPerRegion int `json:"cpsPerRegion"`
	LcrCap       int `json:"lcrCap"`

	// CCR 专用
	CcrGroupsPerSection int `json:"ccrGroupsPerSection"`
	CcrCap              int `json:"ccrCap"`
}

// Store JSON 文件存储
type Store struct {
	mu       sync.RWMutex
	filePath string
	configs  map[string]ProductConfig
}

// NewStore 创建配置存储，若文件不存在则初始化默认配置
func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	fp := filepath.Join(dataDir, "product_configs.json")
	s := &Store{
		filePath: fp,
		configs:  make(map[string]ProductConfig),
	}

	// 尝试加载已有文件
	if data, err := os.ReadFile(fp); err == nil {
		var list []ProductConfig
		if err := json.Unmarshal(data, &list); err == nil {
			for _, c := range list {
				s.configs[c.Name] = c
			}
		}
	}

	// 确保默认配置存在
	if _, ok := s.configs["CJR"]; !ok {
		s.configs["CJR"] = DefaultCJR()
		_ = s.save()
	}

	return s, nil
}

// DefaultCJR 默认 CJR 产品配置
func DefaultCJR() ProductConfig {
	return ProductConfig{
		Name:                "CJR",
		Mode:                "lcr",
		MaxRow:              16384,
		MaxCol:              1024,
		RowCap:              128,
		SectionCnt:          48,
		ColSeg:              2,
		SectionGroupSize:    2048,
		SubsectionSize:      344,
		SubsectionsPerGroup: 6,
		CpsPerRegion:        2,
		LcrCap:              2,
		CcrGroupsPerSection: 8,
		CcrCap:              2,
	}
}

// List 返回所有配置
func (s *Store) List() []ProductConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]ProductConfig, 0, len(s.configs))
	for _, c := range s.configs {
		list = append(list, c)
	}
	return list
}

// Get 获取指定名称的配置
func (s *Store) Get(name string) (ProductConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.configs[name]
	return c, ok
}

// Put 创建或更新配置
func (s *Store) Put(c ProductConfig) error {
	if c.Name == "" {
		return fmt.Errorf("config name cannot be empty")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.configs[c.Name] = c
	return s.save()
}

// Delete 删除配置
func (s *Store) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.configs[name]; !ok {
		return fmt.Errorf("config %q not found", name)
	}
	delete(s.configs, name)
	return s.save()
}

// save 持久化到 JSON 文件（调用方需持有写锁）
func (s *Store) save() error {
	list := make([]ProductConfig, 0, len(s.configs))
	for _, c := range s.configs {
		list = append(list, c)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal configs: %w", err)
	}
	return os.WriteFile(s.filePath, data, 0644)
}
