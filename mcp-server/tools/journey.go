package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func PlanJourneyTool() mcp.Tool {
	return mcp.NewTool(
		"plan_journey",
		mcp.WithDescription("Plan a journey between two locations in London using TFL transport. Returns up to 3 journey options with legs, durations, modes and any disruptions."),
		mcp.WithString("from",
			mcp.Required(),
			mcp.Description("Origin: station name, address, or postcode (e.g. 'Paddington', 'SW1A 1AA')"),
		),
		mcp.WithString("to",
			mcp.Required(),
			mcp.Description("Destination: station name, address, or postcode"),
		),
		mcp.WithString("time",
			mcp.Description("Departure time in HHmm 24-hour format (e.g. '0900' for 9am). Omit for next available."),
		),
		mcp.WithString("modes",
			mcp.Description("Comma-separated transport modes to include: tube, bus, walking, cycle, dlr, overground, elizabeth-line, national-rail. Omit for all modes."),
		),
		mcp.WithString("preference",
			mcp.Description("Journey preference: LeastTime, LeastInterchange, or LeastWalking. Default: LeastTime"),
		),
	)
}

func HandlePlanJourney(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		from := req.GetString("from", "")
		to := req.GetString("to", "")
		time24h := req.GetString("time", "")
		modes := req.GetString("modes", "")
		preference := req.GetString("preference", "")

		if from == "" || to == "" {
			return mcp.NewToolResultError("'from' and 'to' are required"), nil
		}
		if preference == "" {
			preference = "LeastTime"
		}

		results, err := client.PlanJourney(from, to, time24h, modes, preference)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}

		if len(results.Journeys) == 0 {
			return mcp.NewToolResultText("No journeys found between the given locations."), nil
		}

		// Return at most 3 options
		journeys := results.Journeys
		if len(journeys) > 3 {
			journeys = journeys[:3]
		}

		summary := formatJourneys(from, to, journeys)
		raw, _ := json.MarshalIndent(journeys, "", "  ")

		return &mcp.CallToolResult{
			Content: []mcp.Content{
				mcp.NewTextContent(summary),
				mcp.NewTextContent("```json\n" + string(raw) + "\n```"),
			},
		}, nil
	}
}

func formatJourneys(from, to string, journeys []tfl.Journey) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Journey options from %s to %s:\n\n", from, to)

	for i, j := range journeys {
		fmt.Fprintf(&sb, "Option %d — %d min", i+1, j.Duration)
		if j.Fare != nil && j.Fare.TotalCost > 0 {
			fmt.Fprintf(&sb, " | £%.2f", float64(j.Fare.TotalCost)/100)
		}
		fmt.Fprintf(&sb, "\n  Departs: %s | Arrives: %s\n", formatTime(j.StartDateTime), formatTime(j.ArrivalDateTime))

		for k, leg := range j.Legs {
			fmt.Fprintf(&sb, "  Step %d: %s (%s, %d min)\n",
				k+1, leg.Instruction.Summary, leg.Mode.Name, leg.Duration)
			if len(leg.Disruptions) > 0 {
				fmt.Fprintf(&sb, "    ⚠ Disruption: %s\n", leg.Disruptions[0].Description)
			}
		}
		fmt.Fprintln(&sb)
	}
	return sb.String()
}

// formatTime trims the date portion from ISO timestamps like "2026-04-25T09:00:00".
func formatTime(iso string) string {
	if len(iso) >= 16 {
		return iso[11:16]
	}
	return iso
}
