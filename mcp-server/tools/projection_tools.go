package tools

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/projection"
)

// ── Tool definitions ──────────────────────────────────────────────────────────

func GetProjectionCommercialServicesTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_commercial_services",
		mcp.WithDescription(`List Eurostar commercial (passenger-facing) services for a date from the projection API.
Returns a departure board with scheduled times, origin, destination, and cancellation status.
Use when the user asks about Eurostar schedules, departure boards, which trains are running, or route information.
Returns DASHBOARD_START/DASHBOARD_SERVICE/DASHBOARD_END blocks the frontend renders as an interactive board.`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Service date in YYYY-MM-DD format, e.g. '2026-06-28'."),
		),
	)
}

func GetProjectionServiceDetailTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_service_detail",
		mcp.WithDescription(`Get full operational detail for a specific Eurostar service from the projection API.
Returns stops with platform and times, crew legs (roles, shift IDs), train couplings, booking counts by class, and GPS events.
Use when the user asks about a specific service number — where it stops, who is on crew, how many bookings, etc.
Returns PLAN_START/MAP_STATION/PLAN_END blocks the frontend renders as an interactive service card.`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Service date in YYYY-MM-DD format, e.g. '2026-06-28'."),
		),
		mcp.WithString("serviceNumber",
			mcp.Required(),
			mcp.Description("4-digit Eurostar service number, e.g. '9001'."),
		),
	)
}

func GetProjectionJourneyExplorerTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_journey_explorer",
		mcp.WithDescription(`Show a projection-only Eurostar journey explorer for a specific service and date.
Returns PROJ_JOURNEY_START/PROJ_JOURNEY_STOP/PROJ_JOURNEY_EVENT blocks the frontend renders as an animated stop-by-stop journey view with beacon and GPS signals when available.
Use when the user asks to explore a specific train's stops, stop timeline, station-by-station view, or beacon-backed movement.`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Service date in YYYY-MM-DD format, e.g. '2026-06-30'."),
		),
		mcp.WithString("serviceNumber",
			mcp.Required(),
			mcp.Description("4-digit Eurostar service number, e.g. '9007'."),
		),
	)
}

func GetProjectionServicesTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_services",
		mcp.WithDescription(`List Eurostar operational (technical) services for a date from the projection API.
Returns train set numbers, equipment types, route types, and cancellation status.
Use when the user asks about operational or technical plans, engineering movements, or train formations.`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Service date in YYYY-MM-DD format, e.g. '2026-06-28'."),
		),
	)
}

func GetProjectionLiveMapTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_live_map",
		mcp.WithDescription(`Show all Eurostar trains on a live map for a given date from the projection API.
Returns LIVEMAP_START/LIVEMAP_SERVICE markers the frontend renders as an animated geographic map with train positions interpolated between stops.
Use when the user asks to see a map, visualise, plot, or show where all Eurostar trains are.`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Service date in YYYY-MM-DD format, e.g. '2026-06-28'."),
		),
	)
}

func GetProjectionNewsTool() mcp.Tool {
	return mcp.NewTool(
		"get_projection_news",
		mcp.WithDescription(`Fetch active (published, non-archived) news items from the Eurostar projection API.
Returns operational news by department and category. Use when the user asks about notices, alerts, or news.`),
	)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func HandleGetProjectionLiveMap(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		services, err := client.ListServices(date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection live map: %v", err)), nil
		}
		if len(services) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No Eurostar services found for %s.", date)), nil
		}
		details, err := loadProjectionServiceDetails(client, date, services)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection live map: %v", err)), nil
		}
		return mcp.NewToolResultText(formatProjectionLiveMap(date, details)), nil
	}
}

func HandleGetProjectionCommercialServices(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		services, err := client.ListCommercialServices(date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection commercial services: %v", err)), nil
		}
		if len(services) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No Eurostar commercial services found for %s.", date)), nil
		}
		return mcp.NewToolResultText(formatProjectionDashboard(date, services)), nil
	}
}

func HandleGetProjectionServiceDetail(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		serviceNumber := req.GetString("serviceNumber", "")
		if serviceNumber == "" {
			return mcp.NewToolResultError("serviceNumber is required"), nil
		}
		detail, err := client.GetServiceDetail(date, serviceNumber)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection service detail: %v", err)), nil
		}
		return mcp.NewToolResultText(formatProjectionServiceDetail(detail)), nil
	}
}

func HandleGetProjectionJourneyExplorer(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		serviceNumber := req.GetString("serviceNumber", "")
		if serviceNumber == "" {
			return mcp.NewToolResultError("serviceNumber is required"), nil
		}
		detail, err := client.GetServiceDetail(date, serviceNumber)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection journey explorer: %v", err)), nil
		}
		return mcp.NewToolResultText(formatProjectionJourneyExplorer(detail)), nil
	}
}

func HandleGetProjectionServices(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		services, err := client.ListServices(date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection services: %v", err)), nil
		}
		if len(services) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No Eurostar operational services found for %s.", date)), nil
		}
		return mcp.NewToolResultText(formatProjectionOperationalDashboard(date, services)), nil
	}
}

func HandleGetProjectionNews(client *projection.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		news, err := client.ListNews()
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("projection news: %v", err)), nil
		}
		if len(news) == 0 {
			return mcp.NewToolResultText("No active news items found."), nil
		}
		return mcp.NewToolResultText(formatProjectionNews(news)), nil
	}
}

// ── Station resolution helpers ────────────────────────────────────────────────

// projUICShortCode maps UIC station codes (used by the projection API) to
// 3-letter short codes used in coordinates and frontend display.
var projUICShortCode = map[string]string{
	"022726": "SPX", // St-Pancras-International
	"019649": "PNO", // Paris-Nord
	"000218": "BRU", // Bruxelles-Midi
	"022784": "AMS", // Amsterdam-Centraal
	"023316": "RTD", // Rotterdam-Centraal
	"018452": "MVC", // Marne-la-Vallée-Chessy
	"017946": "LIL", // Lille-Europe
	"007667": "KBF", // Köln Hbf
	"016176": "CLQ", // Eurotunnel Portail Sud (French side)
	"022725": "FTN", // Eurotunnel Portail Nord (UK side)
	"000320": "ESL", // Esplechin (passing point)
}

func projResolveCode(code string) string {
	if sc, ok := projUICShortCode[code]; ok {
		return sc
	}
	return strings.ToUpper(code)
}

var projStationCoords = map[string][2]float64{
	"SPX": {51.5314, -0.1233},
	"EBF": {51.4417, 0.3199},
	"ASI": {51.1427, 0.8690},
	"FTN": {51.0930, 1.1380},
	"CLQ": {50.9261, 1.8467},
	"LIL": {50.6367, 3.0742},
	"LEW": {50.6367, 3.0742},
	"PNO": {48.8809, 2.3553},
	"BRU": {50.8358, 4.3356},
	"BXL": {50.8358, 4.3356},
	"LIE": {50.6256, 5.5661},
	"ESL": {50.5656, 3.2850},
	"ASD": {52.3791, 4.8989},
	"AMS": {52.3791, 4.8989},
	"RTD": {51.9247, 4.4675},
	"RDM": {51.9247, 4.4675},
	"MVC": {48.8576, 2.7792},
	"KBF": {50.9431, 6.9588},
}

// UK departure stations (short codes) — used to separate outbound from inbound.
var projUKShortCodes = map[string]bool{"SPX": true, "EBF": true, "ASI": true}

func projCoords(code string) (lat, lon string) {
	sc := projResolveCode(code)
	if c, ok := projStationCoords[sc]; ok {
		return fmt.Sprintf("%.4f", c[0]), fmt.Sprintf("%.4f", c[1])
	}
	return "", ""
}

func projFmtTime(dt string) string {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02T15:04:05.999999999Z07:00"} {
		if t, err := time.Parse(layout, dt); err == nil {
			return t.UTC().Format("15:04")
		}
	}
	return dt
}

func projServiceNumber(id string) string {
	// ID format: "{date}_{serviceNumber}" e.g. "2026-06-28_9001"
	if i := strings.LastIndex(id, "_"); i >= 0 {
		return id[i+1:]
	}
	return id
}

func projPlanID(date, svcNum string) string {
	// Match Euromap planID convention: YYYYMMDD-{serviceNumber}
	// ServiceDate from the API may be a full datetime, extract just YYYY-MM-DD.
	if len(date) > 10 {
		date = date[:10]
	}
	compact := strings.ReplaceAll(date, "-", "")
	return compact + "-" + svcNum
}

func projStatus(cancelled bool) string {
	if cancelled {
		return "deleted"
	}
	return "active"
}

type projectionActualEvent struct {
	Code      string
	EventType string
	Time      string
	Source    string
}

func projParseTime(dt string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02T15:04:05.999999999Z07:00"} {
		if t, err := time.Parse(layout, dt); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func projectionLatestActualEvent(detail *projection.ServiceDetail) *projectionActualEvent {
	var chosen *projectionActualEvent
	var chosenTime time.Time
	consider := func(code, eventType, actualTime, source string) {
		if code == "" || actualTime == "" {
			return
		}
		t, ok := projParseTime(actualTime)
		if !ok {
			return
		}
		next := &projectionActualEvent{
			Code:      projResolveCode(code),
			EventType: eventType,
			Time:      projFmtTime(actualTime),
			Source:    source,
		}
		if chosen == nil || t.After(chosenTime) || (t.Equal(chosenTime) && source == "beacon" && chosen.Source != "beacon") {
			chosen = next
			chosenTime = t
		}
	}
	for _, event := range detail.GPS {
		consider(event.StopCode, event.EventType, event.ActualTime, "gps")
	}
	for _, event := range detail.Beacons {
		consider(event.StopCode, event.EventType, event.ActualTime, "beacon")
	}
	return chosen
}

func formatProjectionActualEvent(event *projectionActualEvent) string {
	if event == nil {
		return ""
	}
	return strings.Join([]string{event.Code, event.EventType, event.Time, event.Source}, "~")
}

// ── LIVEMAP format ────────────────────────────────────────────────────────────
// LIVEMAP_START:{date}|{total}|{active}|{cancelled}|{nowUtc}
// LIVEMAP_SERVICE:{serviceCode}|{status}|{direction}|{rameNumber}|{coaches}|{dep}|{arr}|{stops}|{crew}|{actualEvent}
// stops = comma-separated {code};{lat};{lon};{time};{stopType}

func loadProjectionServiceDetails(client *projection.Client, date string, services []projection.Service) ([]*projection.ServiceDetail, error) {
	details := make([]*projection.ServiceDetail, len(services))
	var wg sync.WaitGroup
	var firstErr error
	var errMu sync.Mutex
	sem := make(chan struct{}, 8)

	for i, service := range services {
		i := i
		service := service
		svcNum := service.ServiceNumber
		if svcNum == "" {
			svcNum = projServiceNumber(service.ID)
		}
		if svcNum == "" {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			detail, err := client.GetServiceDetail(date, svcNum)
			if err != nil {
				errMu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				errMu.Unlock()
				return
			}
			details[i] = detail
		}()
	}

	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}

	out := make([]*projection.ServiceDetail, 0, len(details))
	for _, detail := range details {
		if detail != nil {
			out = append(out, detail)
		}
	}
	return out, nil
}

func projectionLiveMapStopType(idx, lastIdx int, pointType string) string {
	switch {
	case idx == 0:
		return "origin"
	case idx == lastIdx:
		return "destination"
	case strings.Contains(strings.ToUpper(pointType), "PASSING"):
		return "passThrough"
	default:
		return "intermediate"
	}
}

func projectionLiveMapStopTime(stop projection.Stop, idx, lastIdx int, detail *projection.ServiceDetail) string {
	switch {
	case idx == 0:
		if t := projFmtTime(stop.DepartureTime); t != "" {
			return t
		}
		return projFmtTime(detail.Service.ScheduledDeparture)
	case idx == lastIdx:
		if t := projFmtTime(stop.ArrivalTime); t != "" {
			return t
		}
		return projFmtTime(detail.Service.ScheduledArrival)
	default:
		if t := projFmtTime(stop.PassingTime); t != "" {
			return t
		}
		if t := projFmtTime(stop.ArrivalTime); t != "" {
			return t
		}
		return projFmtTime(stop.DepartureTime)
	}
}

func formatProjectionLiveMapStops(detail *projection.ServiceDetail) string {
	if len(detail.Stops) == 0 {
		return ""
	}
	lastIdx := len(detail.Stops) - 1
	parts := make([]string, 0, len(detail.Stops))
	for i, stop := range detail.Stops {
		shortCode := projResolveCode(stop.Code)
		lat, lon := projCoords(stop.Code)
		if lat == "" || lon == "" {
			continue
		}
		stopTime := projectionLiveMapStopTime(stop, i, lastIdx, detail)
		stopType := projectionLiveMapStopType(i, lastIdx, stop.PointType)
		parts = append(parts, shortCode+";"+lat+";"+lon+";"+stopTime+";"+stopType)
	}
	return strings.Join(parts, ",")
}

func formatProjectionLiveMapCrew(crew []projection.CrewLeg) string {
	parts := make([]string, 0, len(crew))
	clean := func(value string) string {
		return strings.NewReplacer("|", " ", ";", " ", ",", " ", "~", " ").Replace(strings.TrimSpace(value))
	}
	for _, member := range crew {
		role := clean(strings.TrimPrefix(member.CrewRole, "CREW_ROLE_"))
		parts = append(parts, strings.Join([]string{role, clean(member.ShiftID), clean(member.ShiftID), ""}, "~"))
	}
	return strings.Join(parts, ";")
}

func formatProjectionLiveMap(date string, details []*projection.ServiceDetail) string {
	now := time.Now().UTC()
	nowHHMM := now.Format("15:04")

	active, cancelled := 0, 0
	for _, detail := range details {
		s := detail.Service
		if s.IsCancelled {
			cancelled++
		} else {
			active++
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "LIVEMAP_START:%s|%d|%d|%d|%s\n", date, len(details), active, cancelled, nowHHMM)

	shown := 0
	for _, detail := range details {
		s := detail.Service
		svcNum := s.ServiceNumber
		if svcNum == "" {
			svcNum = projServiceNumber(s.ID)
		}
		stops := formatProjectionLiveMapStops(detail)
		if stops == "" {
			continue
		}
		dep := projFmtTime(s.ScheduledDeparture)
		arr := projFmtTime(s.ScheduledArrival)
		direction := "inbound"
		if projUKShortCodes[projResolveCode(s.OriginCode)] {
			direction = "outbound"
		}
		crew := formatProjectionLiveMapCrew(detail.Crew)
		actualEvent := formatProjectionActualEvent(projectionLatestActualEvent(detail))
		coaches := 0
		if s.TrainSetNumber != "" {
			coaches = len(strings.Split(s.TrainSetNumber, "-"))
		}
		fmt.Fprintf(&sb, "LIVEMAP_SERVICE:%s|%s|%s|%s|%d|%s|%s|%s|%s|%s\n",
			svcNum, projStatus(s.IsCancelled), direction, s.TrainSetNumber, coaches, dep, arr, stops, crew, actualEvent)
		shown++
	}
	fmt.Fprintf(&sb, "\nHINT: The live map above is rendered by the UI automatically showing %d trains (%d active, %d cancelled) on %s. Reply with 1-2 sentences only summarising the map. Do NOT list individual trains.", shown, active, cancelled, date)
	return sb.String()
}

// ── DASHBOARD format (replaces DASHBOARD_START/SERVICE/END) ──────────────────
// Matches exactly: DASHBOARD_START:{date}|{total}|{active}|{cancelled}|{outbound}|{inbound}
// Then: DASHBOARD_SERVICE:{serviceCode}|{status}|{dep}|{arr}|{originCode}|{destCode}|{stops}
// stops = comma-separated CODE:time pairs

func formatProjectionDashboard(date string, services []projection.CommercialService) string {
	sort.Slice(services, func(i, j int) bool {
		return services[i].ScheduledDeparture < services[j].ScheduledDeparture
	})

	active, cancelled, outbound := 0, 0, 0
	for _, s := range services {
		if s.IsCancelled {
			cancelled++
		} else {
			active++
		}
		if projUKShortCodes[projResolveCode(s.OriginCode)] {
			outbound++
		}
	}
	inbound := len(services) - outbound

	var sb strings.Builder
	fmt.Fprintf(&sb, "Eurostar Dashboard — %s — %d services (%d active, %d cancelled)\n\n",
		date, len(services), active, cancelled)

	fmt.Fprintf(&sb, "DASHBOARD_START:%s|%d|%d|%d|%d|%d\n",
		date, len(services), active, cancelled, outbound, inbound)

	for _, s := range services {
		svcNum := s.ServiceNumber
		if svcNum == "" {
			svcNum = projServiceNumber(s.ID)
		}
		dep := projFmtTime(s.ScheduledDeparture)
		arr := projFmtTime(s.ScheduledArrival)
		originSC := projResolveCode(s.OriginCode)
		destSC := projResolveCode(s.DestinationCode)
		stops := originSC + ":" + dep + "," + destSC + ":" + arr
		fmt.Fprintf(&sb, "DASHBOARD_SERVICE:%s|%s|%s|%s|%s|%s|%s\n",
			svcNum, projStatus(s.IsCancelled), dep, arr, originSC, destSC, stops)
	}

	fmt.Fprintln(&sb, "DASHBOARD_END")
	fmt.Fprintf(&sb, "\nHINT: The dashboard above is rendered by the UI automatically. Reply with 1–2 sentences only: date, total services, how many are active/cancelled. Do NOT list individual services.")
	return sb.String()
}

func formatProjectionOperationalDashboard(date string, services []projection.Service) string {
	sort.Slice(services, func(i, j int) bool {
		return services[i].ScheduledDeparture < services[j].ScheduledDeparture
	})

	active, cancelled, outbound := 0, 0, 0
	for _, s := range services {
		if s.IsCancelled {
			cancelled++
		} else {
			active++
		}
		if projUKShortCodes[projResolveCode(s.OriginCode)] {
			outbound++
		}
	}
	inbound := len(services) - outbound

	var sb strings.Builder
	fmt.Fprintf(&sb, "Eurostar Operational Services — %s — %d services (%d active, %d cancelled)\n\n",
		date, len(services), active, cancelled)

	fmt.Fprintf(&sb, "DASHBOARD_START:%s|%d|%d|%d|%d|%d\n",
		date, len(services), active, cancelled, outbound, inbound)

	for _, s := range services {
		svcNum := s.ServiceNumber
		if svcNum == "" {
			svcNum = projServiceNumber(s.ID)
		}
		dep := projFmtTime(s.ScheduledDeparture)
		arr := projFmtTime(s.ScheduledArrival)
		originSC := projResolveCode(s.OriginCode)
		destSC := projResolveCode(s.DestinationCode)
		stops := originSC + ":" + dep + "," + destSC + ":" + arr
		status := projStatus(s.IsCancelled)
		if s.TrainSetNumber != "" {
			status += "|set:" + s.TrainSetNumber
		}
		fmt.Fprintf(&sb, "DASHBOARD_SERVICE:%s|%s|%s|%s|%s|%s|%s\n",
			svcNum, status, dep, arr, originSC, destSC, stops)
	}

	fmt.Fprintln(&sb, "DASHBOARD_END")
	return sb.String()
}

// ── PLAN format (replaces PLAN_START/MAP_STATION/PLAN_END) ───────────────────
// PLAN_START:{planID}|{planType}|{serviceCode}|{status}|{dep}|{arr}
// MAP_STATION:{code}|{stopType}|{lat}|{lon}|{dep}|{arr}
// PLAN_END

func formatProjectionServiceDetail(d *projection.ServiceDetail) string {
	s := d.Service
	svcNum := s.ServiceNumber
	if svcNum == "" {
		svcNum = projServiceNumber(s.ID)
	}
	svcDate := s.ServiceDate
	if len(svcDate) > 10 {
		svcDate = svcDate[:10]
	}
	planID := projPlanID(svcDate, svcNum)
	status := projStatus(s.IsCancelled)
	dep := projFmtTime(s.ScheduledDeparture)
	arr := projFmtTime(s.ScheduledArrival)

	var sb strings.Builder

	// Human-readable header
	fmt.Fprintf(&sb, "Service %s (%s) — %s\n", svcNum, svcDate, strings.ToUpper(status))
	fmt.Fprintf(&sb, "Route: %s (%s) → %s (%s)\n", s.OriginName, s.OriginCode, s.DestinationName, s.DestinationCode)
	fmt.Fprintf(&sb, "Scheduled: dep %s  arr %s\n", dep, arr)
	if s.TrainSetNumber != "" {
		fmt.Fprintf(&sb, "Train set: %s | Equipment: %s\n", s.TrainSetNumber, s.EquipmentType)
	}

	// PLAN_START marker — parsed by EuromapCard frontend component
	fmt.Fprintf(&sb, "PLAN_START:%s|commercial|%s|%s|%s|%s\n", planID, svcNum, status, dep, arr)

	sort.Slice(d.Stops, func(i, j int) bool { return d.Stops[i].StopIndex < d.Stops[j].StopIndex })
	lastIdx := len(d.Stops) - 1
	for i, stop := range d.Stops {
		sc := projResolveCode(stop.Code)
		lat, lon := projCoords(stop.Code)
		var stopDep, stopArr, stopType string
		switch {
		case i == 0:
			stopType = "origin"
			stopDep = projFmtTime(stop.DepartureTime)
		case i == lastIdx:
			stopType = "destination"
			stopArr = projFmtTime(stop.ArrivalTime)
		default:
			stopType = "passing"
			t := stop.PassingTime
			if t == "" {
				t = stop.ArrivalTime
			}
			stopArr = projFmtTime(t)
		}
		fmt.Fprintf(&sb, "MAP_STATION:%s|%s|%s|%s|%s|%s\n",
			sc, stopType, lat, lon, stopDep, stopArr)
	}
	if actual := projectionLatestActualEvent(d); actual != nil {
		fmt.Fprintf(&sb, "ACTUAL_EVENT:%s|%s|%s|%s\n", actual.Code, actual.EventType, actual.Time, actual.Source)
	}
	fmt.Fprintln(&sb, "PLAN_END")

	// Crew section — emit CREW_DAY_START/ROW/END so CrewCard can render
	// CREW_ROW: crewType|crewId|firstName|lastName|phone|homeDepot|serviceCode|origin|destination|dep|arr
	if len(d.Crew) > 0 {
		fmt.Fprintf(&sb, "\nCrew on service %s (%d leg(s)):\n", svcNum, len(d.Crew))
		fmt.Fprintf(&sb, "CREW_DAY_START:%s\n", svcDate)
		for _, c := range d.Crew {
			cDep := projFmtTime(c.PlannedDeparture)
			cArr := projFmtTime(c.PlannedArrival)
			fmt.Fprintf(&sb, "CREW_ROW:%s|%s||||%s|%s|%s|%s|%s|%s\n",
				c.CrewRole, c.ShiftID, "",
				c.ServiceNumber, c.OriginCode, c.DestinationCode, cDep, cArr)
		}
		fmt.Fprintln(&sb, "CREW_DAY_END")
	}

	// Couplings
	if len(d.Couplings) > 0 {
		fmt.Fprintf(&sb, "\nCouplings (%d):\n", len(d.Couplings))
		for _, c := range d.Couplings {
			fmt.Fprintf(&sb, "  Head %s + Tail %s  %s → %s\n",
				c.HeadServiceID, c.TailServiceID, c.FromCode, c.ToCode)
		}
	}

	// Bookings
	if len(d.Bookings) > 0 {
		total := 0
		for _, b := range d.Bookings {
			total += b.Count
		}
		fmt.Fprintf(&sb, "\nBookings — %d net seats across %d segments:\n", total, len(d.Bookings))
		for _, b := range d.Bookings {
			fmt.Fprintf(&sb, "  %s→%s %s: %d\n", b.OriginCode, b.DestCode, b.ServiceClass, b.Count)
		}
	}

	// GPS
	if len(d.GPS) > 0 {
		fmt.Fprintf(&sb, "\nGPS: %d event(s) recorded", len(d.GPS))
		last := d.GPS[len(d.GPS)-1]
		fmt.Fprintf(&sb, " — latest %s\n", projFmtTime(last.ActualTime))
	}
	if actual := projectionLatestActualEvent(d); actual != nil {
		fmt.Fprintf(&sb, "\nLast confirmed movement: %s %s at %s (%s)\n",
			actual.Code, actual.EventType, actual.Time, strings.ToUpper(actual.Source))
	}

	return sb.String()
}

func formatProjectionJourneyExplorer(d *projection.ServiceDetail) string {
	s := d.Service
	svcNum := s.ServiceNumber
	if svcNum == "" {
		svcNum = projServiceNumber(s.ID)
	}
	date := s.ServiceDate
	if len(date) > 10 {
		date = date[:10]
	}
	originCode := projResolveCode(s.OriginCode)
	destCode := projResolveCode(s.DestinationCode)
	status := projStatus(s.IsCancelled)
	actual := projectionLatestActualEvent(d)

	clean := strings.NewReplacer("|", " ", "~", " ", "\n", " ", "\r", " ")
	safe := func(value string) string {
		return clean.Replace(strings.TrimSpace(value))
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "PROJ_JOURNEY_START:%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\n",
		date,
		svcNum,
		status,
		originCode,
		destCode,
		projFmtTime(s.ScheduledDeparture),
		projFmtTime(s.ScheduledArrival),
		safe(s.TrainSetNumber),
		safe(s.EquipmentType),
		safe(s.RouteType),
	)
	if actual != nil {
		fmt.Fprintf(&sb, "PROJ_JOURNEY_ACTUAL:%s|%s|%s|%s\n",
			actual.Code,
			safe(actual.EventType),
			safe(actual.Time),
			safe(actual.Source),
		)
	}
	for _, stop := range d.Stops {
		shortCode := projResolveCode(stop.Code)
		lat, lon := projCoords(stop.Code)
		fmt.Fprintf(&sb, "PROJ_JOURNEY_STOP:%d|%s|%s|%s|%s|%s|%s|%s|%s|%t|%s|%s\n",
			stop.StopIndex,
			shortCode,
			safe(stop.Name),
			safe(stop.PointType),
			projFmtTime(stop.ArrivalTime),
			projFmtTime(stop.DepartureTime),
			projFmtTime(stop.PassingTime),
			safe(stop.ArrivalPlatform),
			safe(stop.DeparturePlatform),
			stop.IsCancelled,
			lat,
			lon,
		)
	}
	for _, beacon := range d.Beacons {
		fmt.Fprintf(&sb, "PROJ_JOURNEY_EVENT:%s|%s|%s|%s|%t\n",
			projResolveCode(beacon.StopCode),
			safe(beacon.EventType),
			projFmtTime(beacon.ActualTime),
			"beacon",
			beacon.IsCorrection,
		)
	}
	for _, gps := range d.GPS {
		fmt.Fprintf(&sb, "PROJ_JOURNEY_EVENT:%s|%s|%s|%s|%t\n",
			projResolveCode(gps.StopCode),
			safe(gps.EventType),
			projFmtTime(gps.ActualTime),
			"gps",
			gps.IsCorrection,
		)
	}
	fmt.Fprintf(&sb, "PROJ_JOURNEY_END:%s|%d|%d|%d\n", svcNum, len(d.Stops), len(d.Beacons), len(d.GPS))
	fmt.Fprintf(&sb, "\nHINT: The journey explorer above is rendered by the UI automatically for Eurostar service %s on %s. Reply with 1-2 short sentences only.", svcNum, date)
	return sb.String()
}

func formatProjectionNews(news []projection.News) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Active Eurostar news — %d item(s):\n\n", len(news))
	byDept := map[string][]projection.News{}
	var deptOrder []string
	for _, n := range news {
		if _, ok := byDept[n.Department]; !ok {
			deptOrder = append(deptOrder, n.Department)
		}
		byDept[n.Department] = append(byDept[n.Department], n)
	}
	for _, dept := range deptOrder {
		fmt.Fprintf(&sb, "[%s]\n", dept)
		for _, n := range byDept[dept] {
			fmt.Fprintf(&sb, "  %s — published %s\n", n.Category, projFmtTime(n.PublishedAt))
		}
	}
	return sb.String()
}
