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

func GetEuromapLiveMapTool() mcp.Tool {
	return mcp.NewTool(
		"get_eurostar_live_map",
		mcp.WithDescription(`Fetch all Eurostar trains for a date and return structured data for an interactive animated live map.

Use ONLY when the user asks for a map, live map, or to plot trains:
  - "show me a map of trains"
  - "show live map of eurostar"
  - "map of all trains running today"
  - "where are the trains"
  - "plot trains on a map"
  - "give me a map of all trains running today"

Returns LIVEMAP_START/LIVEMAP_SERVICE/LIVEMAP_END blocks that the frontend renders as an interactive animated map with real-time train positions.`),
		mcp.WithString("fromDateTime",
			mcp.Description("Start date/time in ISO8601 format, e.g. '2025-05-12T00:00:00Z'. Omit to use today."),
		),
		mcp.WithString("ranges",
			mcp.Description("Comma-separated ranges, e.g. 'thalys,channel'. Defaults to 'thalys,channel'."),
		),
	)
}

func HandleGetEuromapLiveMap(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
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

		// Fetch technical plans — provides reliable float64 lat/lon per station
		techPlans, _ := client.GetTechnicalPlans(fromDateTime, ranges)
		techByCode := make(map[string]*euromap.TechnicalPlan, len(techPlans))
		for i := range techPlans {
			tp := &techPlans[i]
			techByCode[tp.ServiceCode] = tp
		}

		// Build a station-code → [lat,lon] lookup from all technical plans.
		// The commercial Plan.Station.Latitude/Longitude fields are strings and
		// are often empty; technical PassagePoint.Place has reliable float64 values.
		coordsByCode := buildCoordMap(techPlans)

		return mcp.NewToolResultText(formatLiveMap(fromDateTime, plans, techByCode, coordsByCode)), nil
	}
}

// buildCoordMap collects one reliable lat/lon per station short-code from all
// technical plan PassagePoints, then merges hardcoded fallbacks for any gaps.
func buildCoordMap(techPlans euromap.TechnicalPlansResponse) map[string][2]float64 {
	m := make(map[string][2]float64)
	for _, tp := range techPlans {
		collectPassageCoords(tp.PassagePoints, m)
	}
	for code, coords := range knownStationCoords {
		if _, ok := m[code]; !ok {
			m[code] = coords
		}
	}
	return m
}

func collectPassageCoords(points []euromap.PassagePoint, m map[string][2]float64) {
	for _, pp := range points {
		code := strings.ToUpper(pp.Place.StationInfo.ShortCode)
		if code == "" {
			continue
		}
		if _, seen := m[code]; seen {
			continue
		}
		if pp.Place.Latitude != 0 || pp.Place.Longitude != 0 {
			m[code] = [2]float64{pp.Place.Latitude, pp.Place.Longitude}
		}
	}
}

// knownStationCoords is a last-resort coordinate table for major Eurostar stations.
var knownStationCoords = map[string][2]float64{
	"SPX": {51.5308, -0.1238}, // London St Pancras
	"EBF": {51.4430, 0.3200},  // Ebbsfleet
	"ASI": {51.1448, 0.8740},  // Ashford International
	"CFR": {50.9175, 1.8320},  // Calais-Fréthun
	"FRE": {50.9175, 1.8320},  // Calais-Fréthun (alt code)
	"LIL": {50.6363, 3.0697},  // Lille Europe
	"PNO": {48.8809, 2.3553},  // Paris Nord
	"BXL": {50.8354, 4.3360},  // Brussels Midi
	"ZYP": {50.8354, 4.3360},  // Brussels Midi (alt code)
	"RTD": {51.9225, 4.4692},  // Rotterdam Centraal
	"ASD": {52.3791, 4.8989},  // Amsterdam Centraal
	"AMS": {52.3791, 4.8989},  // Amsterdam (alt)
}

// ── Formatter ─────────────────────────────────────────────────────────────────

// LIVEMAP_SERVICE field layout:
//
//	serviceCode | status | direction | rameNumber | coaches | dep | arr | stops
//
// Each stop: CODE;lat;lon;time;stopType  (semicolon-separated to avoid clash with HH:MM)
// Stops are comma-separated.
func formatLiveMap(
	fromDateTime string,
	plans euromap.PlansResponse,
	techByCode map[string]*euromap.TechnicalPlan,
	coordsByCode map[string][2]float64,
) string {
	sorted := make(euromap.PlansResponse, len(plans))
	copy(sorted, plans)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].DepartureDatetime < sorted[j].DepartureDatetime
	})

	st := aggregatePlans(plans)
	activeCnt := len(st.statusGroups["active"])
	cancelledCnt := len(st.statusGroups["cancelled"])

	var sb strings.Builder
	date := fmtISODate(fromDateTime)
	nowUTC := time.Now().UTC().Format("15:04")

	fmt.Fprintf(&sb, "LIVEMAP_START:%s|%d|%d|%d|%s\n",
		date, len(plans), activeCnt, cancelledCnt, nowUTC)

	for _, p := range sorted {
		direction := "inbound"
		if len(p.Stations) > 0 && ukOriginCodes[strings.ToUpper(p.Stations[0].ShortCode)] {
			direction = "outbound"
		}

		rame, coaches := extractRameInfo(p, techByCode)
		dep := fmtISOTime(p.DepartureDatetime)
		arr := fmtISOTime(p.ArrivalDatetime)
		tp := techByCode[p.ServiceCode]
		stops := liveMapStops(p, tp, coordsByCode)

		fmt.Fprintf(&sb, "LIVEMAP_SERVICE:%s|%s|%s|%s|%d|%s|%s|%s\n",
			p.ServiceCode, p.Status, direction, rame, coaches, dep, arr, stops)
	}

	fmt.Fprintln(&sb, "LIVEMAP_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders LIVEMAP blocks as an interactive animated map with real-time train positions. Reply with 1–2 sentences only: date, total services, active/cancelled count. Do NOT describe or list individual trains.")
	return sb.String()
}

// extractRameInfo returns the rame (formation) identifier and coach count.
// Prefers technical plan data; falls back to commercial plan.
func extractRameInfo(p euromap.Plan, techByCode map[string]*euromap.TechnicalPlan) (rame string, coaches int) {
	if tp, ok := techByCode[p.ServiceCode]; ok {
		seen := make(map[string]bool)
		for _, pp := range tp.PassagePoints {
			if pp.RameNumber != "" {
				if rame == "" {
					rame = pp.RameNumber
				}
				seen[pp.RameNumber] = true
			}
		}
		coaches = len(seen)
	}
	if rame == "" {
		for _, s := range p.Stations {
			if s.RameNumber != "" {
				rame = s.RameNumber
				break
			}
		}
	}
	return
}

// liveMapStops formats each station as CODE:lat:lon:time:stopType.
func liveMapStops(p euromap.Plan, tp *euromap.TechnicalPlan, coordsByCode map[string][2]float64) string {
	n := len(p.Stations)
	if n == 0 {
		return ""
	}
	techTime := buildTechTimeMap(tp)
	parts := make([]string, 0, n)
	for i, s := range p.Stations {
		code := strings.ToUpper(s.ShortCode)
		t := resolveStopTime(s, i, n, p, techTime)
		lat, lon := resolveCoords(s.Latitude, s.Longitude, code, coordsByCode)
		if lat == "" || lon == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s;%s;%s;%s;%s", s.ShortCode, lat, lon, t, s.StopType))
	}
	return strings.Join(parts, ",")
}

// buildTechTimeMap indexes HH:MM times by station short-code from a technical plan.
func buildTechTimeMap(tp *euromap.TechnicalPlan) map[string]string {
	m := make(map[string]string)
	if tp == nil {
		return m
	}
	for _, pp := range tp.PassagePoints {
		code := strings.ToUpper(pp.Place.StationInfo.ShortCode)
		if code == "" {
			continue
		}
		t := passagePointTime(pp)
		if t != "" {
			m[code] = t
		}
	}
	return m
}

func passagePointTime(pp euromap.PassagePoint) string {
	if pp.DepartureTime != nil {
		if t := fmtISOTime(pp.DepartureTime.TheoreticalDateTime); t != "" {
			return t
		}
	}
	if pp.ArrivalTime != nil {
		return fmtISOTime(pp.ArrivalTime.TheoreticalDateTime)
	}
	return ""
}

// resolveStopTime finds the best HH:MM time for a station, falling back to
// plan-level departure (first stop) or arrival (last stop) when nothing else works.
func resolveStopTime(s euromap.Station, idx, total int, p euromap.Plan, techTime map[string]string) string {
	code := strings.ToUpper(s.ShortCode)
	if t := techTime[code]; t != "" {
		return t
	}
	if t := fmtISOTime(s.DepartureDatetime); t != "" {
		return t
	}
	if t := fmtISOTime(s.ArrivalDatetime); t != "" {
		return t
	}
	if idx == 0 {
		return fmtISOTime(p.DepartureDatetime)
	}
	if idx == total-1 {
		return fmtISOTime(p.ArrivalDatetime)
	}
	return ""
}

// resolveCoords returns lat/lon strings for a station, falling back to the
// coordsByCode lookup when the commercial plan fields are empty or zero.
func resolveCoords(lat, lon, code string, coordsByCode map[string][2]float64) (string, string) {
	if lat == "" || lat == "0" || lon == "" || lon == "0" {
		if coords, ok := coordsByCode[code]; ok {
			return fmt.Sprintf("%f", coords[0]), fmt.Sprintf("%f", coords[1])
		}
		return "", ""
	}
	return lat, lon
}
