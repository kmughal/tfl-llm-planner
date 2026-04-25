package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"tfl-backend/handlers"
	"tfl-backend/llm"
	"tfl-backend/mcpclient"
)

func main() {
	ollamaURL := envOr("OLLAMA_URL", "http://localhost:11434/v1")
	ollamaModel := envOr("OLLAMA_MODEL", "llama3.2")
	mcpURL := envOr("MCP_URL", "http://localhost:8081/sse")
	port := envOr("PORT", "8080")

	llmClient := llm.NewClient(ollamaURL, ollamaModel)

	// Connect to MCP server with retry (it may take a moment to start)
	mcpClient := connectMCP(mcpURL)

	h := handlers.NewHandler(llmClient, mcpClient)

	r := gin.Default()
	r.Use(corsMiddleware())

	api := r.Group("/api")
	{
		api.GET("/health", handlers.Health)
		api.POST("/chat", h.Chat)
	}

	log.Printf("Backend starting on :%s (Ollama: %s, model: %s)", port, ollamaURL, ollamaModel)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func connectMCP(url string) *mcpclient.MCPClient {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for {
		c, err := mcpclient.New(ctx, url)
		if err == nil {
			log.Printf("Connected to MCP server at %s", url)
			return c
		}
		log.Printf("MCP not ready (%v), retrying in 2s…", err)
		select {
		case <-ctx.Done():
			log.Fatalf("Could not connect to MCP server at %s: %v", url, ctx.Err())
		case <-time.After(2 * time.Second):
		}
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
