package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"cxmt-ra-smart-eval/engine/handler"
	"cxmt-ra-smart-eval/engine/solver"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// ─── 确定 C++ solver 二进制路径 ───
	solverPath := os.Getenv("SOLVER_PATH")
	if solverPath == "" {
		// 默认：同目录下的 repair_solver
		exe, _ := os.Executable()
		solverPath = filepath.Join(filepath.Dir(exe), "repair_solver")
	}

	// 验证 solver 存在
	if _, err := os.Stat(solverPath); os.IsNotExist(err) {
		log.Fatalf("❌ Solver binary not found at: %s\nSet SOLVER_PATH env or build the C++ solver first.", solverPath)
	}

	runner := solver.NewRunner(solverPath)

	// ─── 配置 Gin ───
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	// ─── CORS 配置（允许前端跨域调用）───
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	// ─── API 路由 ───
	api := r.Group("/api/v1")
	{
		h := handler.NewSolverHandler(runner)
		api.POST("/solve", h.Solve)
		api.GET("/health", h.Health)
	}

	// ─── 前端静态文件服务 ───
	// 查找前端 dist 目录
	exe, _ := os.Executable()
	frontendDir := filepath.Join(filepath.Dir(exe), "frontend-dist")
	if envDir := os.Getenv("FRONTEND_DIR"); envDir != "" {
		frontendDir = envDir
	}

	if info, err := os.Stat(frontendDir); err == nil && info.IsDir() {
		log.Printf("📁 Serving frontend from: %s", frontendDir)
		r.Use(func(c *gin.Context) {
			// 只对非 API 请求提供静态文件
			if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
				c.Next()
				return
			}
			// 尝试提供静态文件
			filePath := filepath.Join(frontendDir, c.Request.URL.Path)
			if _, err := os.Stat(filePath); err == nil {
				http.ServeFile(c.Writer, c.Request, filePath)
				c.Abort()
				return
			}
			// SPA fallback: 所有其他路径返回 index.html
			indexPath := filepath.Join(frontendDir, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				http.ServeFile(c.Writer, c.Request, indexPath)
				c.Abort()
				return
			}
			c.Next()
		})
	} else {
		log.Printf("⚠️  Frontend dir not found: %s (API-only mode)", frontendDir)
	}

	// ─── 启动 ───
	addr := fmt.Sprintf(":%s", port)
	log.Printf("🚀 DRAM Repair Solver starting on %s", addr)
	log.Printf("📍 Solver binary: %s", solverPath)
	log.Printf("📡 Endpoints:")
	log.Printf("   POST /api/v1/solve   - Run repair solver")
	log.Printf("   GET  /api/v1/health  - Health check")
	log.Printf("   GET  /               - Frontend UI")

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Server failed: %v", err)
	}
}
