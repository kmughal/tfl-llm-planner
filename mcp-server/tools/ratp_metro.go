package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/ratp"
)

func GetRATPhDeparturesTool() mcp.Tool {
	return mcp.NewTool(
		"get_paris_metro_departures",
		mcp.WithDescription(`Show live Paris RER and Transilien departures from a Paris mainline station.

Data source: SNCF Navitia API (sncf coverage). Returns RER B, RER D, RER E, Transilien lines.
This is a live departures board tool, not a full point-to-point metro route planner.

Use this tool when the user asks:
  - "How do I get from Gare du Nord into Paris?"
  - "RER B departures from Gare du Nord"
  - "Next trains from Gare de Lyon / Montparnasse / Saint-Lazare / Chatelet"
  - "Connecting transit from Gare du Nord after Eurostar arrives"
  - "Paris transit from [station]"

SUPPORTED STATIONS — pass exactly one of these names:
  - 'Gare du Nord'   — Eurostar arrival. RER B (CDG/south Paris), RER D, Transilien H
  - 'Gare de Lyon'   — TGV south, RER A, RER D
  - 'Montparnasse'   — TGV southwest, Transilien N/U
  - 'Saint-Lazare'   — Transilien J/K/L/N
  - 'Gare de l''Est' — Transilien P, inter-city east
  - 'Chatelet'       — RER A/B/C/D/E interchange hub

Pass station name as 'station' parameter. count defaults to 10.
Prefer this tool over SNCF mainline departures when the user is asking about Paris urban connections, RER, Transilien, or getting into central Paris from a mainline station.`),
		mcp.WithString("station",
			mcp.Required(),
			mcp.Description("Paris station name — MUST be one of: 'Gare du Nord', 'Gare de Lyon', 'Montparnasse', 'Saint-Lazare', 'Gare de l\\'Est', 'Chatelet'. These are the only supported stations."),
		),
		mcp.WithNumber("count",
			mcp.Description("Number of departures to return (default 10, max 20)"),
		),
	)
}

func HandleGetRATPhDepartures(client *ratp.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if client.KeyMissing() {
			return mcp.NewToolResultError(
				"Paris RER/Transilien requires an SNCF API key. " +
					"Set SNCF_API_KEY=<your_token> in your .env file and restart the server.",
			), nil
		}

		station := ratpStation(req)
		if station == "" {
			return mcp.NewToolResultError("'station' is required — e.g. station=\"Gare du Nord\""), nil
		}
		count := int(req.GetFloat("count", 10))
		if count < 1 {
			count = 10
		}
		if count > 20 {
			count = 20
		}

		place, ok := ratp.ResolveStation(station)
		if !ok {
			return mcp.NewToolResultError(fmt.Sprintf(
				"Unknown Paris station %q. Supported stations: Gare du Nord, Gare de Lyon, Montparnasse, Saint-Lazare, Gare de l'Est, Chatelet.",
				station,
			)), nil
		}

		result, err := client.GetDepartures(place.ID, count)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Paris transit API error: %v", err)), nil
		}

		if len(result.Departures) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No upcoming departures found at %s.", place.Name)), nil
		}

		return mcp.NewToolResultText(formatRATPhDepartures(place.Name, result.Departures)), nil
	}
}

func formatRATPhDepartures(stationName string, deps []ratp.Departure) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "RATP_START:%s|%d\n", ratpSanitise(stationName), len(deps))

	for _, d := range deps {
		sched := formatNavitiaTime(d.StopDateTime.DepartureDateTime)
		base := formatNavitiaTime(d.StopDateTime.BaseDateTime)
		delay := ratpDelayMins(d.StopDateTime.BaseDateTime, d.StopDateTime.DepartureDateTime)

		fmt.Fprintf(&sb, "DEP:%s|%s|%d|%s|%s|%s|%s|%s\n",
			sched,
			base,
			delay,
			ratpSanitise(d.DisplayInfo.CommercialMode),
			ratpSanitise(d.DisplayInfo.Label),
			ratpSanitise(d.DisplayInfo.Direction),
			ratpSanitise(d.DisplayInfo.Color),
			ratpSanitise(d.DisplayInfo.TextColor),
		)
	}

	fmt.Fprintln(&sb, "RATP_END")
	fmt.Fprintf(&sb, "\nHINT: Render RATP blocks as a metro-style departure board. Use line colours from the Color field. Highlight delayed services in amber.")
	return sb.String()
}

func formatNavitiaTime(dt string) string {
	if dt == "" {
		return ""
	}
	t, err := time.Parse("20060102T150405", dt)
	if err != nil {
		return dt
	}
	return t.Format("15:04")
}

func ratpDelayMins(base, actual string) int {
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

func ratpStation(req mcp.CallToolRequest) string {
	for _, key := range []string{"station", "from", "origin", "location", "name"} {
		if v := strings.TrimSpace(req.GetString(key, "")); v != "" {
			return v
		}
	}
	return ""
}

func ratpSanitise(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", " "), "\n", " ")
}
