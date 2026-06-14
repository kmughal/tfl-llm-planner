package tools

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

var sncfOverviewStations = []string{"Paris Montparnasse", "Lyon Part-Dieu", "Marseille Saint-Charles", "Bordeaux Saint-Jean"}

func GetSNCFDashboardTool() mcp.Tool {
	return mcp.NewTool(
		"get_sncf_dashboard",
		mcp.WithDescription(`Build a live SNCF national operating dashboard from major-station departure boards and active network disruptions.

Use ONLY for broad SNCF overview requests such as:
  - "Show the SNCF dashboard"
  - "How is the French rail network running?"
  - "Give me a national SNCF operating overview"
  - "Show major SNCF hubs and current incidents"

Do NOT use for one station board (get_sncf_departures or get_sncf_arrivals), one train (get_sncf_train), a journey (plan_sncf_journey), or disruption-only questions (get_sncf_disruptions).

Returns structured SNCF_DASHBOARD blocks for the frontend and a concise model summary hint.`),
	)
}

type sncfBoardResult struct {
	station string
	deps    []sncf.Departure
	err     error
}

func HandleGetSNCFDashboard(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		results := make([]sncfBoardResult, len(sncfOverviewStations))
		var wg sync.WaitGroup
		for i, station := range sncfOverviewStations {
			wg.Add(1)
			go func(index int, name string) {
				defer wg.Done()
				places, err := client.SearchPlaces(name)
				if err != nil || len(places) == 0 {
					results[index] = sncfBoardResult{station: name, err: err}
					return
				}
				board, err := client.GetDepartures(places[0].ID, 8)
				if err != nil {
					results[index] = sncfBoardResult{station: places[0].Name, err: err}
					return
				}
				results[index] = sncfBoardResult{station: places[0].Name, deps: board.Departures}
			}(i, station)
		}

		disruptions, disruptionErr := client.GetDisruptions(15)
		wg.Wait()

		available := 0
		for _, result := range results {
			if result.err == nil && len(result.deps) > 0 {
				available++
			}
		}
		if available == 0 && disruptionErr != nil {
			return mcp.NewToolResultError("SNCF dashboard data is unavailable"), nil
		}

		return mcp.NewToolResultText(formatSNCFDashboard(results, disruptions)), nil
	}
}

func formatSNCFDashboard(boards []sncfBoardResult, disruptions *sncf.DisruptionsResponse) string {
	var sb strings.Builder
	incidentCount := 0
	if disruptions != nil {
		incidentCount = len(disruptions.Disruptions)
	}
	fmt.Fprintf(&sb, "SNCF_DASHBOARD_START:%d|%d\n", len(boards), incidentCount)
	for _, board := range boards {
		if board.err != nil {
			continue
		}
		fmt.Fprintf(&sb, "SNCF_BOARD:%s|%d\n", sanitiseField(board.station), len(board.deps))
		for _, departure := range board.deps {
			delay := delayBetween(departure.StopDateTime.BaseDateTime, departure.StopDateTime.DepartureDateTime)
			fmt.Fprintf(&sb, "SNCF_SERVICE:%s|%s|%d|%s|%s|%s\n",
				formatSNCFTime(departure.StopDateTime.DepartureDateTime),
				formatSNCFTime(departure.StopDateTime.BaseDateTime),
				delay,
				sanitiseField(departure.DisplayInfo.CommercialMode),
				sanitiseField(departure.DisplayInfo.Label),
				sanitiseField(departure.DisplayInfo.Direction),
			)
		}
	}
	if disruptions != nil {
		for _, disruption := range disruptions.Disruptions {
			impacted, message := "", ""
			if len(disruption.ImpactedObjects) > 0 {
				impacted = disruption.ImpactedObjects[0].PtObject.Name
			}
			if len(disruption.Messages) > 0 {
				message = disruption.Messages[0].Text
			}
			fmt.Fprintf(&sb, "SNCF_INCIDENT:%s|%s|%s|%s\n",
				sanitiseField(disruption.Severity.Effect), sanitiseField(disruption.Severity.Name),
				sanitiseField(impacted), sanitiseField(message))
		}
	}
	fmt.Fprintln(&sb, "SNCF_DASHBOARD_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders the dashboard automatically. Reply in 1-2 sentences with station coverage, delayed departures, and active incident count. Do not list every service.")
	return sb.String()
}
