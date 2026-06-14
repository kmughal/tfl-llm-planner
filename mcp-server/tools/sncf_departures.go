package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func GetSNCFDeparturesTool() mcp.Tool {
	return mcp.NewTool(
		"get_sncf_departures",
		mcp.WithDescription(`Show the live departures board for any SNCF train station in France.

Returns the next departures from a station including:
  - Scheduled and real-time departure times
  - Train type (TGV, TER, Intercités, Ouigo) and train number
  - Final destination (direction)
  - Delay in minutes when the train is running late

Use this tool when the user asks:
  - "What trains leave from Lyon Part-Dieu in the next hour?"
  - "Show me departures from Paris Gare de Lyon"
  - "Next trains from Bordeaux?"
  - "Is the 14:00 TGV from Marseille on time?"

Hints:
  - Use the full station name for accuracy (e.g. 'Paris Gare de Lyon' not 'Paris').
  - Paris has multiple termini — infer the correct one from context or ask the user.
  - 'count' defaults to 10; increase to 20 for a fuller board.
  - The SNCF stop-area feed may include TGV, TER, Intercités, Ouigo, Transilien, or RER services depending on the selected station.`),
		mcp.WithString("station",
			mcp.Required(),
			mcp.Description("Station name to get departures for, e.g. 'Paris Gare de Lyon', 'Lyon Part-Dieu', 'Bordeaux Saint-Jean', 'Marseille Saint-Charles', 'Strasbourg', 'Nantes', 'Lille Flandres'"),
		),
		mcp.WithNumber("count",
			mcp.Description("Number of departures to return (default 10, max 20)"),
		),
	)
}

func HandleGetSNCFDepartures(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		station := req.GetString("station", "")
		if station == "" {
			return mcp.NewToolResultError("'station' is required"), nil
		}
		count := int(req.GetFloat("count", 10))
		if count < 1 {
			count = 10
		}
		if count > 20 {
			count = 20
		}

		places, err := client.SearchPlaces(station)
		if err != nil || len(places) == 0 {
			return mcp.NewToolResultError(fmt.Sprintf("Could not find station %q: %v", station, err)), nil
		}

		result, err := client.GetDepartures(places[0].ID, count)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.Departures) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No upcoming departures found at %s.", places[0].Name)), nil
		}

		return mcp.NewToolResultText(formatDeparturesBoard(places[0].Name, result.Departures)), nil
	}
}

func formatDeparturesBoard(stationName string, deps []sncf.Departure) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "DEPARTURES_START:%s|%d\n", sanitiseField(stationName), len(deps))

	for _, d := range deps {
		sched := formatSNCFTime(d.StopDateTime.DepartureDateTime)
		base := formatSNCFTime(d.StopDateTime.BaseDateTime)
		delay := delayBetween(d.StopDateTime.BaseDateTime, d.StopDateTime.DepartureDateTime)

		delayStr := "0"
		if delay > 0 {
			delayStr = fmt.Sprintf("%d", delay)
		}

		fmt.Fprintf(&sb, "DEP:%s|%s|%s|%s|%s|%s\n",
			sanitiseField(sched),
			sanitiseField(base),
			sanitiseField(delayStr),
			sanitiseField(d.DisplayInfo.CommercialMode),
			sanitiseField(d.DisplayInfo.Label),
			sanitiseField(d.DisplayInfo.Direction),
		)
	}

	fmt.Fprintln(&sb, "DEPARTURES_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders DEPARTURES blocks as a live board. Reply with a brief summary of the next few trains and highlight any delays.")
	return sb.String()
}

// delayBetween returns delay in minutes between base and actual Navitia datetimes.
func delayBetween(base, actual string) int {
	if base == "" || actual == "" || base == actual {
		return 0
	}
	layout := "20060102T150405"
	b, err1 := time.Parse(layout, base)
	a, err2 := time.Parse(layout, actual)
	if err1 != nil || err2 != nil {
		return 0
	}
	mins := int(a.Sub(b).Minutes())
	if mins < 0 {
		return 0
	}
	return mins
}
