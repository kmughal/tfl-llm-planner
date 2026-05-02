package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func GetSNCFArrivalsTool() mcp.Tool {
	return mcp.NewTool(
		"get_sncf_arrivals",
		mcp.WithDescription(`Show the live arrivals board for any SNCF train station in France.

Returns the next trains arriving at a station including:
  - Scheduled and real-time arrival times
  - Train type (TGV, TER, Intercités, Ouigo) and train number
  - Origin direction
  - Delay in minutes when the train is running late

Use this tool when the user asks:
  - "What trains are arriving at Lyon Part-Dieu soon?"
  - "Is the train from Paris arriving on time at Bordeaux?"
  - "Show me arrivals at Marseille Saint-Charles"
  - "When does the next train from Strasbourg arrive in Paris?"

Hints:
  - Use the full station name for accuracy (e.g. 'Marseille Saint-Charles' not just 'Marseille').
  - 'count' defaults to 10; increase to 20 for a fuller board.
  - Complements get_sncf_departures — use arrivals when the user cares about when a train reaches its destination.`),
		mcp.WithString("station",
			mcp.Required(),
			mcp.Description("Station name to get arrivals for, e.g. 'Lyon Part-Dieu', 'Bordeaux Saint-Jean', 'Marseille Saint-Charles', 'Paris Gare de Lyon', 'Nantes', 'Rennes', 'Nice Ville'"),
		),
		mcp.WithNumber("count",
			mcp.Description("Number of arrivals to return (default 10, max 20)"),
		),
	)
}

func HandleGetSNCFArrivals(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
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

		result, err := client.GetArrivals(places[0].ID, count)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.Arrivals) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No upcoming arrivals found at %s.", places[0].Name)), nil
		}

		return mcp.NewToolResultText(formatArrivalsBoard(places[0].Name, result.Arrivals)), nil
	}
}

func formatArrivalsBoard(stationName string, arrivals []sncf.Arrival) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "ARRIVALS_START:%s|%d\n", sanitiseField(stationName), len(arrivals))

	for _, a := range arrivals {
		sched := formatSNCFTime(a.StopDateTime.ArrivalDateTime)
		base := formatSNCFTime(a.StopDateTime.BaseArrivalDateTime)
		delay := delayBetween(a.StopDateTime.BaseArrivalDateTime, a.StopDateTime.ArrivalDateTime)

		delayStr := "0"
		if delay > 0 {
			delayStr = fmt.Sprintf("%d", delay)
		}

		fmt.Fprintf(&sb, "ARR:%s|%s|%s|%s|%s|%s\n",
			sanitiseField(sched),
			sanitiseField(base),
			sanitiseField(delayStr),
			sanitiseField(a.DisplayInfo.CommercialMode),
			sanitiseField(a.DisplayInfo.Label),
			sanitiseField(a.DisplayInfo.Direction),
		)
	}

	fmt.Fprintln(&sb, "ARRIVALS_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders ARRIVALS blocks as a live board. Reply with a brief summary of the next few trains and highlight any delays.")
	return sb.String()
}
