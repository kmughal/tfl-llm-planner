package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"tfl-backend/handlers"
	"tfl-backend/llm"
	"tfl-backend/logger"
	"tfl-backend/mcpclient"
	"tfl-backend/memory"
)

func main() {
	ollamaURL := envOr("OLLAMA_URL", "http://localhost:11434/v1")
	ollamaModel := envOr("OLLAMA_MODEL", "llama3.2")
	mcpURL := envOr("MCP_URL", "http://localhost:8081/sse")
	port := envOr("PORT", "8080")
	memPath := envOr("MEMORY_FILE", "./memory.json")
	serviceFlagsPath := envOr("SERVICE_FLAGS_FILE", "./service_flags.json")
	responseCachePath := envOr("RESPONSE_CACHE_DIR", "./response_cache")

	llmClient := llm.NewClient(ollamaURL, ollamaModel)

	memStore, err := memory.NewFileStore(memPath)
	if err != nil {
		log.Fatalf("Failed to open memory store at %s: %v", memPath, err)
	}
	defer memStore.Close()

	if err := handlers.InitServiceRegistry(serviceFlagsPath); err != nil {
		log.Fatalf("Failed to initialise service registry at %s: %v", serviceFlagsPath, err)
	}
	if err := handlers.InitResponseCache(responseCachePath); err != nil {
		log.Fatalf("Failed to initialise response cache at %s: %v", responseCachePath, err)
	}

	// Connect to MCP server with retry (it may take a moment to start)
	mcpClient := connectMCP(mcpURL)

	h := handlers.NewHandler(llmClient, mcpClient, memStore)
	mh := handlers.NewMemoryHandler(memStore)

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(httpLogMiddleware())

	envFile := envOr("ENV_FILE", "../.env")

	api := r.Group("/api")
	{
		api.GET("/health", handlers.Health)
		api.POST("/chat", h.Chat)
		api.GET("/logs/stream", handlers.LogStream)
		api.GET("/config", handlers.GetConfig(envFile))
		api.POST("/config", handlers.UpdateConfig(envFile))
		api.GET("/services/status", handlers.GetServiceStatus)
		api.POST("/services/status", handlers.UpdateServiceStatus)
		api.GET("/buses", handlers.GetBusLines)
		api.GET("/buses/:lineID/arrivals", handlers.GetBusLineArrivals)
		api.GET("/tfl/command-center", h.GetTFLCommandCenter)
		api.GET("/tfl/lines/:lineID/crowding", h.GetTFLLineCrowding)
		api.GET("/sncf/command-center", h.GetSNCFCommandCenter)
		api.GET("/national-rail/command-center", h.GetNationalRailCommandCenter)
		api.GET("/paris/command-center", h.GetParisCommandCenter)
		api.GET("/operations/wall", h.GetOperationsWall)
		api.DELETE("/memory/:sessionId", mh.FlushMemory)
		api.GET("/eurostar/trains", handlers.GetEurostarTrains)
		api.GET("/eurostar/catalog", handlers.GetEurostarCatalog)
		api.GET("/eurostar/trains/:planID", handlers.GetEurostarTrainByID)
		api.GET("/eurostar/projection/journeys", handlers.GetProjectionJourneyServices)
		api.GET("/eurostar/projection/journeys/:date/:serviceNumber", handlers.GetProjectionJourneyDetail)
		api.GET("/eurostar/projection/bookings", handlers.GetProjectionBookings)
		api.GET("/eurostar/projection/beacons", handlers.GetProjectionBeacons)
		api.GET("/eurostar/projection/news", handlers.GetProjectionNews)
		api.GET("/eurostar/traveler-summary", h.GetEurostarTravelerSummary)
		api.GET("/eurostar/watchlist", h.GetEurostarWatchlist)
		api.GET("/crew/activities", handlers.GetCrewActivities)
	}

	logger.Info(logger.TagSystem, fmt.Sprintf("backend starting on :%s", port),
		fmt.Sprintf("ollama=%s model=%s", ollamaURL, ollamaModel))
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

func httpLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		elapsed := float64(time.Since(start).Microseconds()) / 1000
		logger.Info(logger.TagHTTP,
			fmt.Sprintf("%s %s → %d", c.Request.Method, c.Request.URL.Path, c.Writer.Status()),
			fmt.Sprintf("%.2fms", elapsed),
		)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
