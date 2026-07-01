package main

import (
	"fmt"
	"os"

	"github.com/mark3labs/mcp-go/server"
	"tfl-mcp-server/euromap"
	"tfl-mcp-server/nationalrail"
	"tfl-mcp-server/projection"
	"tfl-mcp-server/ratp"
	"tfl-mcp-server/sncf"
	"tfl-mcp-server/sotenabler"
	"tfl-mcp-server/tfl"
	"tfl-mcp-server/tools"
	"tfl-mcp-server/traveler"
	"tfl-mcp-server/weather"
)

func main() {
	tflClient := tfl.NewClient(os.Getenv("TFL_APP_KEY"))
	sncfClient := sncf.NewClient(os.Getenv("SNCF_API_KEY"))
	euromapClient := euromap.NewClient(os.Getenv("EUROMAP_CLIENT_ID"), os.Getenv("EUROMAP_CLIENT_SECRET"))
	travelerClient := traveler.NewClient(os.Getenv("TRAVELER_CLIENT_ID"), os.Getenv("TRAVELER_CONSUMER_ID"))
	weatherClient := weather.NewClient()
	nrailClient := nationalrail.NewClient(os.Getenv("DARWIN_TOKEN"))
	ratpClient := ratp.NewClient(os.Getenv("SNCF_API_KEY"))
	sotClient := sotenabler.NewClient(os.Getenv("SOT_CLIENT_ID"), os.Getenv("SOT_CLIENT_SECRET"))
	projectionClient := projection.NewClient(os.Getenv("PROJECTION_BASE_URL"))

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
	s.AddTool(tools.GetTFLRoadsTool(), tools.HandleGetTFLRoads(tflClient))
	s.AddTool(tools.GetRoadDisruptionsTool(), tools.HandleGetRoadDisruptions(tflClient))
	s.AddTool(tools.GetBusArrivalsTool(), tools.HandleGetBusArrivals(tflClient))
	s.AddTool(tools.GetAllBusLinesTool(), tools.HandleGetAllBusLines(tflClient))

	// SNCF (France) tools
	s.AddTool(tools.PlanSNCFJourneyTool(), tools.HandlePlanSNCFJourney(sncfClient))
	s.AddTool(tools.SearchSNCFStationsTool(), tools.HandleSearchSNCFStations(sncfClient))
	s.AddTool(tools.GetSNCFDisruptionsTool(), tools.HandleGetSNCFDisruptions(sncfClient))
	s.AddTool(tools.GetSNCFDeparturesTool(), tools.HandleGetSNCFDepartures(sncfClient))
	s.AddTool(tools.GetSNCFArrivalsTool(), tools.HandleGetSNCFArrivals(sncfClient))
	s.AddTool(tools.GetSNCFTrainTool(), tools.HandleGetSNCFTrain(sncfClient))
	s.AddTool(tools.GetSNCFDashboardTool(), tools.HandleGetSNCFDashboard(sncfClient))

	// Traveler (Eurostar passenger load) tools
	s.AddTool(tools.GetTravelerSummaryTool(), tools.HandleGetTravelerSummary(travelerClient))

	// Euromap (Eurostar) tools
	s.AddTool(tools.GetEuromapPlansTool(), tools.HandleGetEuromapPlans(euromapClient))
	s.AddTool(tools.GetEuromapTechnicalPlansTool(), tools.HandleGetEuromapTechnicalPlans(euromapClient))
	s.AddTool(tools.GetEuromapPlanByIDTool(), tools.HandleGetEuromapPlanByID(euromapClient))
	s.AddTool(tools.GetEuromapTechnicalPlanByIDTool(), tools.HandleGetEuromapTechnicalPlanByID(euromapClient))
	s.AddTool(tools.GetEuromapDashboardTool(), tools.HandleGetEuromapDashboard(euromapClient))
	s.AddTool(tools.GetEuromapLiveMapTool(), tools.HandleGetEuromapLiveMap(euromapClient, sotClient))

	// Weather, National Rail, Paris Metro tools
	s.AddTool(tools.GetWeatherTool(), tools.HandleGetWeather(weatherClient))
	s.AddTool(tools.GetNationalRailDeparturesTool(), tools.HandleGetNationalRailDepartures(nrailClient))
	s.AddTool(tools.GetNationalRailArrivalsTool(), tools.HandleGetNationalRailArrivals(nrailClient))
	s.AddTool(tools.GetNationalRailDashboardTool(), tools.HandleGetNationalRailDashboard(nrailClient))
	s.AddTool(tools.GetRATPhDeparturesTool(), tools.HandleGetRATPhDepartures(ratpClient))

	// SOT Enabler (Eurostar crew / driver) tools
	s.AddTool(tools.GetCrewActivitiesTool(), tools.HandleGetCrewActivities(sotClient))
	s.AddTool(tools.GetCrewMonthlyScheduleTool(), tools.HandleGetCrewMonthlySchedule(sotClient))

	// Eurostar Projection API tools (alternative data source, toggled via service flag)
	s.AddTool(tools.GetProjectionLiveMapTool(), tools.HandleGetProjectionLiveMap(projectionClient))
	s.AddTool(tools.GetProjectionCommercialServicesTool(), tools.HandleGetProjectionCommercialServices(projectionClient))
	s.AddTool(tools.GetProjectionServiceDetailTool(), tools.HandleGetProjectionServiceDetail(projectionClient))
	s.AddTool(tools.GetProjectionJourneyExplorerTool(), tools.HandleGetProjectionJourneyExplorer(projectionClient))
	s.AddTool(tools.GetProjectionServicesTool(), tools.HandleGetProjectionServices(projectionClient))
	s.AddTool(tools.GetProjectionNewsTool(), tools.HandleGetProjectionNews(projectionClient))

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
