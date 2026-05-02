package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/traveler"
)

// ── Tool definition ───────────────────────────────────────────────────────────

func GetTravelerSummaryTool() mcp.Tool {
	return mcp.NewTool(
		"get_traveler_summary",
		mcp.WithDescription(`Get Eurostar passenger load data for a travel date.
Returns total traveler count per service, broken down by:
  • Service class: standard / comfort / premium
  • Passenger type: normal / kid / senior / youth / pmr / vip / group

Use this when the user asks about: how busy a train is, passenger numbers, occupancy,
service class breakdown, traveler statistics, or demographic split for Eurostar services.
Data is cached per calendar day; subsequent requests for the same date use the cache.
Defaults to today if no date is given.
Combine with get_euromap_plans for full schedule + load data on the same service.`),
		mcp.WithString("travelDate",
			mcp.Description("Travel date in YYYY-MM-DD format, e.g. '2025-10-15'. Defaults to today."),
		),
		mcp.WithString("serviceCode",
			mcp.Description("Optional: filter to a specific service code, e.g. '9036'. If omitted, all services for the day are returned."),
		),
	)
}

// ── Handler ───────────────────────────────────────────────────────────────────

func HandleGetTravelerSummary(client *traveler.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("travelDate", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		serviceCode := req.GetString("serviceCode", "")

		data, err := client.GetTravelerSummary(date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Traveler API error: %v", err)), nil
		}
		if len(data) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No traveler data available for %s", date)), nil
		}

		if serviceCode != "" {
			var filtered traveler.Response
			for _, s := range data {
				if strings.EqualFold(s.ServiceCode, serviceCode) {
					filtered = append(filtered, s)
				}
			}
			if len(filtered) == 0 {
				return mcp.NewToolResultText(fmt.Sprintf("No traveler data for service %s on %s", serviceCode, date)), nil
			}
			data = filtered
		}

		return mcp.NewToolResultText(formatTravelerSummary(date, data)), nil
	}
}

// ── Formatter ─────────────────────────────────────────────────────────────────

const travelerClassOrder = "standard,comfort,premium"
const travelerTypeOrder  = "normal,kid,senior,youth,pmr,vip,group"

func formatTravelerSummary(date string, data traveler.Response) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Eurostar Traveler Summary %s — %d service(s)\n\n", date, len(data))

	// Machine-readable block for the frontend
	fmt.Fprintf(&sb, "TRAVELER_SUMMARY_START:%s|%d\n", date, len(data))

	for _, svc := range data {
		classCounts := map[string]int{}
		typeCounts  := map[string]int{}
		origin, destination := "", ""

		for _, route := range svc.Routes {
			if origin == "" {
				origin = route.Origin
				destination = route.Destination
			}
			for _, coach := range route.Coaches {
				for _, sc := range coach.ServiceClasses {
					classCounts[sc.ServiceClass] += sc.TravelerCount
				}
				for _, d := range coach.Details {
					typeCounts[d.Type] += d.TravelerCount
				}
			}
		}

		fmt.Fprintf(&sb, "SERVICE_START:%s|%d|%s|%s\n",
			svc.ServiceCode, svc.TravelerCount, origin, destination)

		for _, cls := range strings.Split(travelerClassOrder, ",") {
			if cnt := classCounts[cls]; cnt > 0 {
				fmt.Fprintf(&sb, "CLASS:%s|%d\n", cls, cnt)
			}
		}
		for _, typ := range strings.Split(travelerTypeOrder, ",") {
			if cnt := typeCounts[typ]; cnt > 0 {
				fmt.Fprintf(&sb, "TYPE:%s|%d\n", typ, cnt)
			}
		}
		fmt.Fprintln(&sb, "SERVICE_END")
	}

	fmt.Fprintln(&sb, "TRAVELER_SUMMARY_END")

	// Human-readable summary
	fmt.Fprintln(&sb, "\nSummary:")
	for _, svc := range data {
		classCounts := map[string]int{}
		origin, destination := "", ""
		for _, route := range svc.Routes {
			if origin == "" {
				origin, destination = route.Origin, route.Destination
			}
			for _, coach := range route.Coaches {
				for _, sc := range coach.ServiceClasses {
					classCounts[sc.ServiceClass] += sc.TravelerCount
				}
			}
		}
		parts := []string{}
		for _, cls := range strings.Split(travelerClassOrder, ",") {
			if cnt := classCounts[cls]; cnt > 0 {
				parts = append(parts, fmt.Sprintf("%s: %d", cls, cnt))
			}
		}
		fmt.Fprintf(&sb, "  Service %s (%s→%s): %d pax — %s\n",
			svc.ServiceCode, origin, destination, svc.TravelerCount, strings.Join(parts, ", "))
	}

	return sb.String()
}
