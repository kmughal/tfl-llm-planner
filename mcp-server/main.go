package main

import (
	"fmt"
	"os"

	"github.com/mark3labs/mcp-go/server"
	"tfl-mcp-server/tfl"
	"tfl-mcp-server/tools"
)

func main() {
	appKey := os.Getenv("TFL_APP_KEY") // optional — higher rate limits

	tflClient := tfl.NewClient(appKey)

	s := server.NewMCPServer(
		"tfl-journey-planner",
		"1.0.0",
		server.WithToolCapabilities(false),
	)

	// Register tools
	s.AddTool(tools.PlanJourneyTool(), tools.HandlePlanJourney(tflClient))
	s.AddTool(tools.GetLineStatusTool(), tools.HandleGetLineStatus(tflClient))
	s.AddTool(tools.GetStatusByModeTool(), tools.HandleGetStatusByMode(tflClient))
	s.AddTool(tools.SearchStopsTool(), tools.HandleSearchStops(tflClient))

	transport := os.Getenv("MCP_TRANSPORT") // "stdio" (default) or "sse"

	switch transport {
	case "sse":
		port := os.Getenv("MCP_PORT")
		if port == "" {
			port = "8081"
		}
		fmt.Fprintf(os.Stderr, "TFL MCP server starting on SSE :%s\n", port)
		sseServer := server.NewSSEServer(s)
		if err := sseServer.Start(":" + port); err != nil {
			fmt.Fprintf(os.Stderr, "SSE server error: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintln(os.Stderr, "TFL MCP server starting on stdio")
		if err := server.ServeStdio(s); err != nil {
			fmt.Fprintf(os.Stderr, "Stdio server error: %v\n", err)
			os.Exit(1)
		}
	}
}
