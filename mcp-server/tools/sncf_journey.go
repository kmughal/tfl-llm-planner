package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func PlanSNCFJourneyTool() mcp.Tool {
	return mcp.NewTool(
		"plan_sncf_journey",
		mcp.WithDescription("Plan a train journey on the SNCF French rail network. Searches for stations by name and returns journey options with departure/arrival times, duration, train type, and number of connections."),
		mcp.WithString("from",
			mcp.Required(),
			mcp.Description("Origin station name (e.g. 'Paris Gare de Lyon', 'Lyon Part-Dieu', 'Marseille Saint-Charles')"),
		),
		mcp.WithString("to",
			mcp.Required(),
			mcp.Description("Destination station name"),
		),
		mcp.WithString("datetime",
			mcp.Description("Departure date/time in YYYYMMDDTHHmmss format (e.g. '20260425T090000'). Omit for next available departures."),
		),
	)
}

func HandlePlanSNCFJourney(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		from := req.GetString("from", "")
		to := req.GetString("to", "")
		datetime := req.GetString("datetime", "")

		if from == "" || to == "" {
			return mcp.NewToolResultError("'from' and 'to' are required"), nil
		}

		// Resolve station names to IDs
		fromPlaces, err := client.SearchPlaces(from)
		if err != nil || len(fromPlaces) == 0 {
			return mcp.NewToolResultError(fmt.Sprintf("Could not find station %q: %v", from, err)), nil
		}
		toPlaces, err := client.SearchPlaces(to)
		if err != nil || len(toPlaces) == 0 {
			return mcp.NewToolResultError(fmt.Sprintf("Could not find station %q: %v", to, err)), nil
		}

		fromID := fromPlaces[0].ID
		fromName := fromPlaces[0].Name
		toID := toPlaces[0].ID
		toName := toPlaces[0].Name

		result, err := client.PlanJourney(fromID, toID, datetime, 3)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.Journeys) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No journeys found from %s to %s.", fromName, toName)), nil
		}

		return mcp.NewToolResultText(formatSNCFJourneys(fromName, toName, result.Journeys)), nil
	}
}

func formatSNCFJourneys(from, to string, journeys []sncf.Journey) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "SNCF journeys from %s to %s:\n\n", from, to)

	for i, j := range journeys {
		mins := j.Duration / 60
		hours := mins / 60
		mins = mins % 60

		fmt.Fprintf(&sb, "Option %d — ", i+1)
		if hours > 0 {
			fmt.Fprintf(&sb, "%dh%02dmin", hours, mins)
		} else {
			fmt.Fprintf(&sb, "%d min", mins)
		}
		if j.NbTransfers > 0 {
			fmt.Fprintf(&sb, " | %d connection(s)", j.NbTransfers)
		} else {
			fmt.Fprintf(&sb, " | Direct")
		}
		fmt.Fprintf(&sb, "\n  Departs: %s | Arrives: %s\n",
			formatSNCFTime(j.DepartureDatetime),
			formatSNCFTime(j.ArrivalDatetime),
		)

		for k, sec := range j.Sections {
			if sec.Type == "waiting" || sec.Type == "crow_fly" {
				continue
			}
			secMins := sec.Duration / 60
			if sec.DisplayInfo != nil {
				fmt.Fprintf(&sb, "  Step %d: %s %s → %s (%d min)\n",
					k+1,
					sec.DisplayInfo.CommercialMode,
					sec.DisplayInfo.Label,
					sec.DisplayInfo.Direction,
					secMins,
				)
			} else {
				fmt.Fprintf(&sb, "  Step %d: %s → %s (%d min)\n",
					k+1, sec.From.Name, sec.To.Name, secMins,
				)
			}
		}
		fmt.Fprintln(&sb)
	}
	return sb.String()
}

// formatSNCFTime converts "20260425T090000" to "09:00".
func formatSNCFTime(dt string) string {
	if len(dt) >= 15 {
		return dt[9:11] + ":" + dt[11:13]
	}
	return dt
}
