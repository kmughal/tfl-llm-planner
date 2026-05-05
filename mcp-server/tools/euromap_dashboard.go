package tools

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/euromap"
)

func GetEuromapDashboardTool() mcp.Tool {
	return mcp.NewTool(
		"get_eurostar_dashboard",
		mcp.WithDescription(`Build a Eurostar departure board for a given date showing all services with stop times.

Use when the user asks for a departure board, dashboard, or full list of services — even without those exact words.
Do NOT use for map/live-map requests.

Trigger phrases (any of these → use this tool):
  - "departure board", "full departure board", "departures today"
  - "dashboard", "build dashboard", "eurostar dashboard"
  - "all departures", "all services today", "full schedule"
  - "show me all trains today", "list all trains", "what trains are running"
  - "cancelled trains on Eurostar", "which trains are cancelled", "cancelled services"
  - "disruptions on Eurostar", "delayed Eurostar trains", "affected services"

Examples:
  - "Full departure board for today"
  - "Show me the Eurostar departure board"
  - "Eurostar dashboard for tomorrow"
  - "What are all the trains running today?"
  - "Give me the full schedule for today"
  - "All Eurostar services on Friday"

Returns DASHBOARD_START/DASHBOARD_SERVICE/DASHBOARD_END blocks the frontend renders as an interactive board.`),
		mcp.WithString("fromDateTime",
			mcp.Description("Start date/time in ISO8601 format, e.g. '2025-05-12T00:00:00Z'. Omit to use today."),
		),
		mcp.WithString("ranges",
			mcp.Description("Comma-separated ranges, e.g. 'thalys,channel'. Defaults to 'thalys,channel'."),
		),
	)
}

func HandleGetEuromapDashboard(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		fromDateTime := req.GetString("fromDateTime", "")
		if fromDateTime == "" {
			fromDateTime = time.Now().UTC().Format(isoDateTimeZero)
		}
		ranges := req.GetString("ranges", defaultRanges)

		plans, err := client.GetPlans(fromDateTime, ranges)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf(euromapAPIErr, err)), nil
		}
		if len(plans) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No Eurostar services found for %s.", fmtISODate(fromDateTime))), nil
		}

		return mcp.NewToolResultText(formatDashboard(fromDateTime, plans)), nil
	}
}

func formatDashboard(fromDateTime string, plans euromap.PlansResponse) string {
	sorted := make(euromap.PlansResponse, len(plans))
	copy(sorted, plans)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].DepartureDatetime < sorted[j].DepartureDatetime
	})

	st := aggregatePlans(plans)
	inbound := len(plans) - st.outbound
	activeCnt := len(st.statusGroups["active"])
	cancelledCnt := len(st.statusGroups["cancelled"])

	var sb strings.Builder
	date := fmtISODate(fromDateTime)
	fmt.Fprintf(&sb, "Eurostar Dashboard — %s — %d services (%d active, %d cancelled)\n\n",
		date, len(plans), activeCnt, cancelledCnt)

	fmt.Fprintf(&sb, "DASHBOARD_START:%s|%d|%d|%d|%d|%d\n",
		date, len(plans), activeCnt, cancelledCnt, st.outbound, inbound)

	for _, p := range sorted {
		origin, dest := dashboardEndpoints(p)
		dep := fmtISOTime(p.DepartureDatetime)
		arr := fmtISOTime(p.ArrivalDatetime)
		stops := dashboardStops(p)
		fmt.Fprintf(&sb, "DASHBOARD_SERVICE:%s|%s|%s|%s|%s|%s|%s\n",
			p.ServiceCode, p.Status, dep, arr, origin, dest, stops)
	}

	fmt.Fprintln(&sb, "DASHBOARD_END")
	fmt.Fprintf(&sb, "\nHINT: The dashboard above is rendered by the UI automatically. Reply with 1–2 sentences only: date, total services, how many are active/cancelled. Do NOT list individual services.")
	return sb.String()
}

func dashboardEndpoints(p euromap.Plan) (origin, dest string) {
	if len(p.Stations) > 0 {
		origin = p.Stations[0].ShortCode
		dest = p.Stations[len(p.Stations)-1].ShortCode
	}
	return
}

func dashboardStops(p euromap.Plan) string {
	stops := make([]string, 0, len(p.Stations))
	for _, s := range p.Stations {
		t := fmtISOTime(s.DepartureDatetime)
		if t == "" {
			t = fmtISOTime(s.ArrivalDatetime)
		}
		stops = append(stops, s.ShortCode+":"+t)
	}
	return strings.Join(stops, ",")
}
