package main

import (
	"fmt"
	"os"

	"github.com/mark3labs/mcp-go/server"
	"tfl-mcp-server/sncf"
	"tfl-mcp-server/tfl"
	"tfl-mcp-server/tools"
)

func main() {
	tflClient := tfl.NewClient(os.Getenv("TFL_APP_KEY"))
	sncfClient := sncf.NewClient(os.Getenv("SNCF_API_KEY"))

	s := server.NewMCPServer(
		"transport-journey-planner",
		"1.0.0",
		server.WithToolCapabilities(false),
	)

	// TFL (London) tools
	s.AddTool(tools.PlanJourneyTool(), tools.HandlePlanJourney(tflClient))
	s.AddTool(tools.GetLineStatusTool(), tools.HandleGetLineStatus(tflClient))
	s.AddTool(tools.GetStatusByModeTool(), tools.HandleGetStatusByMode(tflClient))
	s.AddTool(tools.SearchStopsTool(), tools.HandleSearchStops(tflClient))

	// SNCF (France) tools
	s.AddTool(tools.PlanSNCFJourneyTool(), tools.HandlePlanSNCFJourney(sncfClient))
	s.AddTool(tools.SearchSNCFStationsTool(), tools.HandleSearchSNCFStations(sncfClient))
	s.AddTool(tools.GetSNCFDisruptionsTool(), tools.HandleGetSNCFDisruptions(sncfClient))

	transport := os.Getenv("MCP_TRANSPORT") // "stdio" (default) or "sse"

	switch transport {
	case "sse":
		port := os.Getenv("MCP_PORT")
		if port == "" {
			port = "8081"
		}
		fmt.Fprintf(os.Stderr, "Transport MCP server starting on SSE :%s\n", port)
		sseServer := server.NewSSEServer(s)
		if err := sseServer.Start(":" + port); err != nil {
			fmt.Fprintf(os.Stderr, "SSE server error: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintln(os.Stderr, "Transport MCP server starting on stdio")
		if err := server.ServeStdio(s); err != nil {
			fmt.Fprintf(os.Stderr, "Stdio server error: %v\n", err)
			os.Exit(1)
		}
	}
}
