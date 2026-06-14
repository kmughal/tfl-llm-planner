package tools

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/nationalrail"
)

func GetNationalRailDeparturesTool() mcp.Tool {
	return mcp.NewTool("get_national_rail_departures",
		mcp.WithDescription(`Live UK National Rail departure board for one station. Use for departures, next trains, platforms, delays, cancellations, or trains from a UK mainline station. This is not a journey planner. Use the optional destination filter when the user asks for trains to a particular place.`),
		mcp.WithString("station", mcp.Required(), mcp.Description("Origin station name or three-letter CRS code, for example King's Cross, KGX, Leeds or LDS")),
		mcp.WithString("destination", mcp.Description("Optional destination station name or CRS code used to filter the live board")),
		mcp.WithNumber("count", mcp.Description("Maximum services to return, default 10 and maximum 20")),
	)
}

func GetNationalRailArrivalsTool() mcp.Tool {
	return mcp.NewTool("get_national_rail_arrivals",
		mcp.WithDescription(`Live UK National Rail arrivals board for one station. Use for arrivals, incoming trains, expected arrival times, or trains arriving from a particular origin. Do not use the departures tool for an arrivals request.`),
		mcp.WithString("station", mcp.Required(), mcp.Description("Destination station name or three-letter CRS code, for example King's Cross or KGX")),
		mcp.WithString("origin", mcp.Description("Optional origin station name or CRS code used to filter the live board")),
		mcp.WithNumber("count", mcp.Description("Maximum services to return, default 10 and maximum 20")),
	)
}

func GetNationalRailDashboardTool() mcp.Tool {
	return mcp.NewTool("get_national_rail_dashboard",
		mcp.WithDescription(`Aggregated live National Rail operating picture across major London terminals. Use for a National Rail dashboard, network overview, mainline operating picture, major hubs, widespread delays, or station alerts. For one station use the departures or arrivals tool instead.`),
		mcp.WithNumber("count", mcp.Description("Services per hub, default 6 and maximum 10")),
	)
}

func HandleGetNationalRailDepartures(client *nationalrail.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return handleNationalRailBoard(client, "departures")
}

func HandleGetNationalRailArrivals(client *nationalrail.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return handleNationalRailBoard(client, "arrivals")
}

func handleNationalRailBoard(client *nationalrail.Client, kind string) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		station := nrArgument(req, "station", "at", "from", "origin", "crs", "location")
		if kind == "arrivals" {
			station = nrArgument(req, "station", "at", "to", "destination", "crs", "location")
		}
		if station == "" {
			return mcp.NewToolResultError("'station' is required; pass a UK station name or CRS code"), nil
		}
		count := nrCount(req, 10, 20)
		crs := resolveCRS(station)
		var result *nationalrail.DeparturesResponse
		var err error
		filter := ""
		if kind == "arrivals" {
			result, err = client.GetArrivals(crs, count)
			filter = nrArgument(req, "origin", "from")
		} else {
			result, err = client.GetDepartures(crs, count)
			filter = nrArgument(req, "destination", "to")
		}
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("National Rail live feed error: %v", err)), nil
		}
		services := filterNRServices(result.TrainServices, kind, filter)
		return mcp.NewToolResultText(formatNRBoard(result, kind, filter, services)), nil
	}
}

var nrDashboardHubs = []struct{ name, crs string }{
	{"London King's Cross", "KGX"}, {"London St Pancras", "STP"}, {"London Euston", "EUS"},
	{"London Paddington", "PAD"}, {"London Waterloo", "WAT"}, {"London Victoria", "VIC"},
}

func HandleGetNationalRailDashboard(client *nationalrail.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		count := nrCount(req, 6, 10)
		type hubResult struct {
			name, crs string
			board     *nationalrail.DeparturesResponse
			err       error
		}
		results := make([]hubResult, len(nrDashboardHubs))
		var wg sync.WaitGroup
		for i, hub := range nrDashboardHubs {
			wg.Add(1)
			go func(index int, name, crs string) {
				defer wg.Done()
				board, err := client.GetDepartures(crs, count)
				results[index] = hubResult{name: name, crs: crs, board: board, err: err}
			}(i, hub.name, hub.crs)
		}
		wg.Wait()

		var sb strings.Builder
		total := 0
		for _, result := range results {
			if result.board != nil {
				total += len(result.board.TrainServices)
			}
		}
		fmt.Fprintf(&sb, "NRAIL_DASHBOARD_START:%s|%d|%d\n", time.Now().UTC().Format(time.RFC3339), len(results), total)
		for _, result := range results {
			if result.err != nil || result.board == nil {
				fmt.Fprintf(&sb, "NRAIL_HUB:%s|%s|0|0|0|unavailable\n", nrSanitise(result.name), result.crs)
				continue
			}
			delayed, cancelled := 0, 0
			for _, service := range result.board.TrainServices {
				_, _, delay, status := nrTiming(service, "departures")
				if delay > 0 {
					delayed++
				}
				if status == "cancelled" {
					cancelled++
				}
			}
			fmt.Fprintf(&sb, "NRAIL_HUB:%s|%s|%d|%d|%d|live\n", nrSanitise(result.board.LocationName), result.crs, len(result.board.TrainServices), delayed, cancelled)
			for _, service := range result.board.TrainServices {
				scheduled, expected, delay, status := nrTiming(service, "departures")
				place, _ := nrPlace(service.Destination)
				fmt.Fprintf(&sb, "NRAIL_DASH_SERVICE:%s|%s|%s|%d|%s|%s|%s|%s|%s\n", result.crs, scheduled, expected, delay, nrSanitise(service.Operator), nrSanitise(place), nrPlatform(service), status, nrSanitise(service.TrainID))
			}
			for _, notice := range result.board.NRCCMessages {
				fmt.Fprintf(&sb, "NRAIL_ALERT:%s|%s\n", result.crs, nrSanitise(nationalrail.PlainMessage(notice.XHTMLMessage)))
			}
		}
		fmt.Fprintln(&sb, "NRAIL_DASHBOARD_END")
		return mcp.NewToolResultText(sb.String()), nil
	}
}

func formatNRBoard(r *nationalrail.DeparturesResponse, kind, filter string, services []nationalrail.TrainService) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "NRAIL_BOARD_START:%s|%s|%s|%s|%d|%s\n", kind, nrSanitise(r.LocationName), r.CRS, r.GeneratedAt, len(services), nrSanitise(filter))
	for _, notice := range r.NRCCMessages {
		fmt.Fprintf(&sb, "NRAIL_NOTICE:%s\n", nrSanitise(nationalrail.PlainMessage(notice.XHTMLMessage)))
	}
	for _, service := range services {
		scheduled, expected, delay, status := nrTiming(service, kind)
		locations := service.Destination
		if kind == "arrivals" {
			locations = service.Origin
		}
		place, placeCRS := nrPlace(locations)
		reason := ""
		if service.IsCancelled && service.CancelReason != nil {
			reason = fmt.Sprintf("Cancellation reason code %d", service.CancelReason.Value)
		}
		fmt.Fprintf(&sb, "NRAIL_SERVICE:%s|%s|%d|%s|%s|%s|%s|%s|%s|%s|%s\n", scheduled, expected, delay, nrSanitise(service.Operator), nrSanitise(place), placeCRS, nrPlatform(service), status, nrSanitise(service.TrainID), nrSanitise(service.UID), nrSanitise(reason))
	}
	fmt.Fprintln(&sb, "NRAIL_BOARD_END")
	return sb.String()
}

func nrTiming(service nationalrail.TrainService, kind string) (string, string, int, string) {
	scheduled, expected := service.STD, service.ETD
	if kind == "arrivals" {
		scheduled, expected = service.STA, service.ETA
	}
	scheduledText, expectedText := nationalrail.FormatHHMM(scheduled), nationalrail.FormatHHMM(expected)
	delay := nationalrail.DelayMins(scheduled, expected)
	status := "on-time"
	if service.IsCancelled {
		status = "cancelled"
	} else if delay > 0 {
		status = "delayed"
	} else if expectedText == "" {
		expectedText = "On time"
	}
	return scheduledText, expectedText, delay, status
}

func nrPlatform(service nationalrail.TrainService) string {
	if service.PlatformIsHidden || service.Platform == "" {
		return "TBC"
	}
	return nrSanitise(service.Platform)
}

func nrPlace(values []nationalrail.Destination) (string, string) {
	if len(values) == 0 {
		return "", ""
	}
	name := values[0].LocationName
	if values[0].Via != "" {
		name += " (via " + values[0].Via + ")"
	}
	return name, values[0].CRS
}

func filterNRServices(services []nationalrail.TrainService, kind, filter string) []nationalrail.TrainService {
	if strings.TrimSpace(filter) == "" {
		return services
	}
	wanted, wantedCRS := strings.ToLower(strings.TrimSpace(filter)), resolveCRS(filter)
	filtered := make([]nationalrail.TrainService, 0, len(services))
	for _, service := range services {
		places := service.Destination
		if kind == "arrivals" {
			places = service.Origin
		}
		for _, place := range places {
			if strings.EqualFold(place.CRS, wantedCRS) || strings.Contains(strings.ToLower(place.LocationName), wanted) {
				filtered = append(filtered, service)
				break
			}
		}
	}
	return filtered
}

func resolveCRS(input string) string {
	trimmed := strings.TrimSpace(input)
	lower := strings.ToLower(trimmed)
	if code, ok := nationalrail.KnownStations[lower]; ok {
		return code
	}
	return strings.ToUpper(trimmed)
}

func nrArgument(req mcp.CallToolRequest, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(req.GetString(key, "")); value != "" {
			return value
		}
	}
	return ""
}

func nrCount(req mcp.CallToolRequest, fallback, maximum int) int {
	count := int(req.GetFloat("count", float64(fallback)))
	if count < 1 {
		return fallback
	}
	if count > maximum {
		return maximum
	}
	return count
}

func nrSanitise(value string) string {
	value = strings.ReplaceAll(value, "|", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return strings.TrimSpace(value)
}
