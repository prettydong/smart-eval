package handler

import (
	"net/http"

	"cxmt-ra-smart-eval/engine/config"

	"github.com/gin-gonic/gin"
)

type ConfigHandler struct {
	store *config.Store
}

func NewConfigHandler(store *config.Store) *ConfigHandler {
	return &ConfigHandler{store: store}
}

// ListConfigs GET /api/v1/configs — 列出所有产品配置
func (h *ConfigHandler) ListConfigs(c *gin.Context) {
	c.JSON(http.StatusOK, h.store.List())
}

// GetConfig GET /api/v1/configs/:name — 获取指定配置
func (h *ConfigHandler) GetConfig(c *gin.Context) {
	name := c.Param("name")
	cfg, ok := h.store.Get(name)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "config not found", "name": name})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

// PutConfig PUT /api/v1/configs — 创建或更新配置
func (h *ConfigHandler) PutConfig(c *gin.Context) {
	var cfg config.ProductConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config", "message": err.Error()})
		return
	}
	if err := h.store.Put(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "name": cfg.Name})
}

// DeleteConfig DELETE /api/v1/configs/:name — 删除配置
func (h *ConfigHandler) DeleteConfig(c *gin.Context) {
	name := c.Param("name")
	if err := h.store.Delete(name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted", "name": name})
}
