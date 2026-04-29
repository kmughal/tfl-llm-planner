package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func PlanJourneyTool() mcp.Tool {
	return mcp.NewTool(
		"plan_journey",
		mcp.WithDescription(`Plan a journey between two locations WITHIN Greater London using the TFL network (tube, bus, DLR, Overground, Elizabeth line, tram).

SCOPE — use ONLY when BOTH origin AND destination are inside the M25 / Greater London area.

NEVER use for:
  - Any journey to or from Paris, Brussels, or Amsterdam → use get_euromap_plans
  - Any journey wholly within France → use plan_sncf_journey
  - "London to Paris", "London to Brussels", "St Pancras to Paris" → use get_euromap_plans
  - Any mention of Eurostar or the Channel Tunnel → use get_euromap_plans

Examples that SHOULD use this tool:
  - "Paddington to London Bridge"
  - "How do I get to Canary Wharf from King's Cross?"
  - "From Heathrow to Waterloo"
  - "Victoria to Stratford"`),
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

		return mcp.NewToolResultText(formatJourneys(from, to, journeys)), nil
	}
}

func writeJourney(sb *strings.Builder, i int, j tfl.Journey) {
	writeJourneyHeader(sb, i, j)
	writeJourneyStops(sb, j.Legs)
	writeJourneySteps(sb, j.Legs)
	fmt.Fprintln(sb)
}

func writeJourneyHeader(sb *strings.Builder, i int, j tfl.Journey) {
	connections := len(j.Legs) - 1
	fmt.Fprintf(sb, "Option %d — %d min", i+1, j.Duration)
	if j.Fare != nil && j.Fare.TotalCost > 0 {
		fmt.Fprintf(sb, " | £%.2f", float64(j.Fare.TotalCost)/100)
	}
	if connections == 0 {
		fmt.Fprintf(sb, " | Direct")
	} else {
		fmt.Fprintf(sb, " | %d connection(s)", connections)
	}
	fmt.Fprintf(sb, "\n  Departs: %s | Arrives: %s\n", formatTime(j.StartDateTime), formatTime(j.ArrivalDateTime))
}

// writeJourneyStops emits Stop: lines for every station on the journey,
// including intermediate stops from each leg's path when available.
func writeJourneyStops(sb *strings.Builder, legs []tfl.Leg) {
	seen := map[string]bool{}
	emit := func(name, t string) {
		if seen[name] {
			return
		}
		seen[name] = true
		if t != "" {
			fmt.Fprintf(sb, "  Stop: %s (%s)\n", name, t)
		} else {
			fmt.Fprintf(sb, "  Stop: %s\n", name)
		}
	}
	for k, leg := range legs {
		if k == 0 {
			emit(leg.DeparturePoint.CommonName, formatTime(leg.DepartureTime))
		}
		emitLegIntermediates(leg, emit)
		emit(leg.ArrivalPoint.CommonName, formatTime(leg.ArrivalTime))
	}
}

func emitLegIntermediates(leg tfl.Leg, emit func(name, t string)) {
	if leg.Path == nil {
		return
	}
	dep := leg.DeparturePoint.CommonName
	arr := leg.ArrivalPoint.CommonName
	for _, sp := range leg.Path.StopPoints {
		if sp.Name != dep && sp.Name != arr {
			emit(sp.Name, "")
		}
	}
}

func writeJourneySteps(sb *strings.Builder, legs []tfl.Leg) {
	for k, leg := range legs {
		fmt.Fprintf(sb, "  Step %d: %s (%s, %d min)\n",
			k+1, leg.Instruction.Summary, leg.Mode.Name, leg.Duration)
		if len(leg.Disruptions) > 0 {
			fmt.Fprintf(sb, "    ⚠ Disruption: %s\n", leg.Disruptions[0].Description)
		}
	}
}

func formatJourneys(from, to string, journeys []tfl.Journey) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Journey options from %s to %s:\n\n", from, to)
	for i, j := range journeys {
		writeJourney(&sb, i, j)
	}
	sb.WriteString("HINT: Present each journey using the EXACT 'Option N —' heading format above. Do NOT rewrite as narrative prose. Each option will be rendered as an interactive animated card in the UI.")
	return sb.String()
}

// formatTime trims the date portion from ISO timestamps like "2026-04-25T09:00:00".
func formatTime(iso string) string {
	if len(iso) >= 16 {
		return iso[11:16]
	}
	return iso
}
