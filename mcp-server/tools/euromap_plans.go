package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/euromap"
)

const (
	euromapAPIErr    = "Euromap API error: %v"
	defaultRanges    = "thalys,channel"
	isoDateTimeZero  = "2006-01-02T00:00:00Z"
	compactDateFmt   = "20060102"
)

// ── Tool definitions ──────────────────────────────────────────────────────────

func GetEuromapPlansTool() mcp.Tool {
	return mcp.NewTool(
		"get_euromap_plans",
		mcp.WithDescription(`Fetch Eurostar commercial service schedules with station stops and coordinates.

ALWAYS use this tool (instead of plan_journey or plan_sncf_journey) when:
  - The journey crosses the Channel Tunnel: London ↔ Paris, London ↔ Brussels, London ↔ Amsterdam
  - The user mentions "Eurostar", "Channel Tunnel", "St Pancras International", or "cross-channel"
  - The user asks what international trains are running between the UK and Europe
  - Origin or destination is St Pancras, Ebbsfleet, Ashford, Calais, Lille, Paris Nord, Brussels Midi, Amsterdam

ALWAYS provide "from" and "to" when the user specifies an origin and/or destination.
Known stations: London/St Pancras (SPX), Paris/Paris Nord (PNO), Brussels/Brussels Midi (BRU),
Amsterdam (AMS), Rotterdam (RDM), Lille Europe (LEW), Calais Frethun (FTN), Liège (LIE), Marne-la-Vallée (MVC).

Returns map data and stop times for each matching service. Defaults to today if no date is given.`),
		mcp.WithString("from",
			mcp.Description("Origin station name or code, e.g. 'Brussels Midi', 'BXL', 'London', 'Paris'. Used to filter services."),
		),
		mcp.WithString("to",
			mcp.Description("Destination station name or code, e.g. 'Paris', 'PNO', 'London', 'Brussels'. Used to filter services."),
		),
		mcp.WithString("fromDateTime",
			mcp.Description("Start date/time in ISO8601 format, e.g. '2025-05-12T00:00:00Z'. Omit to use today's date."),
		),
		mcp.WithString("ranges",
			mcp.Description("Comma-separated ranges to filter by, e.g. 'thalys,channel'. Defaults to 'thalys,channel'."),
		),
	)
}

func GetEuromapTechnicalPlansTool() mcp.Tool {
	return mcp.NewTool(
		"get_euromap_technical_plans",
		mcp.WithDescription("Fetch Eurostar technical/operational train plans with passage points and coordinates. Use ONLY when the user explicitly asks for 'technical plans', 'operational plans', 'engineering movements', or 'depot runs'. For regular Eurostar schedules use get_euromap_plans instead. Defaults to today if no date given."),
		mcp.WithString("fromDateTime",
			mcp.Description("Start date/time in ISO8601 format, e.g. '2025-05-21T00:00:00Z'. Omit to use today's date."),
		),
		mcp.WithString("ranges",
			mcp.Description("Comma-separated ranges to filter by, e.g. 'thalys,channel'. Defaults to 'thalys,channel'."),
		),
	)
}

func GetEuromapTechnicalPlanByIDTool() mcp.Tool {
	return mcp.NewTool(
		"get_euromap_technical_plan_by_id",
		mcp.WithDescription("Fetch a single Eurostar TECHNICAL/OPERATIONAL plan by its plan ID. "+
			"Use ONLY when the user explicitly asks for 'technical plan', 'operational plan', or 'engineering movements' for a specific service number. "+
			"Do NOT use this for general arrival/departure time questions — use get_euromap_plan_by_id instead. "+
			"Examples: 'Give me technical plan for train 9409 on 2025-05-19', 'Show operational details for Eurostar 9004 today'. "+
			"Build planID as YYYYMMDD-{serviceCode}, e.g. '20250519-9409'. Default date to today if not given."),
		mcp.WithString("planID",
			mcp.Description("Full plan ID combining date and service code, e.g. '20250519-9409'."),
		),
		mcp.WithString("date",
			mcp.Description("Date portion in YYYYMMDD format. Used when planID is not provided directly. Defaults to today."),
		),
		mcp.WithString("serviceCode",
			mcp.Description("Train/service number (e.g. '9409'). Used together with date to build the planID."),
		),
	)
}

func GetEuromapPlanByIDTool() mcp.Tool {
	return mcp.NewTool(
		"get_euromap_plan_by_id",
		mcp.WithDescription("Fetch a single Eurostar commercial plan by its plan ID (date + service code joined, e.g. '20250519-9409'). "+
			"Use this tool when the user mentions a specific train or service number, for example: "+
			"'Give me plan for train 9409 running on 2025-05-19', "+
			"'Show me details for Eurostar service 9004 today', "+
			"'What stops does train 9409 make?', "+
			"'Get plan 20250519-9409'. "+
			"If a date is not mentioned, default to today. Build the planID as YYYYMMDD-{serviceCode}."),
		mcp.WithString("planID",
			mcp.Description("Full plan ID combining date and service code, e.g. '20250519-9409'. If not known, build it from the date (YYYYMMDD) and service/train number joined by a hyphen."),
		),
		mcp.WithString("date",
			mcp.Description("Date portion in YYYYMMDD format (e.g. '20250519'). Used when planID is not provided directly. Defaults to today."),
		),
		mcp.WithString("serviceCode",
			mcp.Description("Train/service number (e.g. '9409'). Used together with date to build the planID when planID is not provided directly."),
		),
	)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func HandleGetEuromapTechnicalPlanByID(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		planID, date, serviceCode, buildErr := resolvePlanID(
			req.GetString("planID", ""),
			req.GetString("date", ""),
			req.GetString("serviceCode", ""),
		)
		if buildErr != nil {
			return mcp.NewToolResultError(buildErr.Error()), nil
		}

		if plan, err := client.GetTechnicalPlanByID(planID); err == nil {
			return mcp.NewToolResultText(formatTechnicalPlans(planID, "", euromap.TechnicalPlansResponse{*plan})), nil
		}

		return technicalPlanByServiceCodeFallback(client, planID, date, serviceCode)
	}
}

func HandleGetEuromapPlanByID(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		planID, date, serviceCode, buildErr := resolvePlanID(
			req.GetString("planID", ""),
			req.GetString("date", ""),
			req.GetString("serviceCode", ""),
		)
		if buildErr != nil {
			return mcp.NewToolResultError(buildErr.Error()), nil
		}

		// Primary: direct /v1/plans/:id lookup
		if plan, err := client.GetPlanByID(planID); err == nil {
			return mcp.NewToolResultText(formatPlans(planID, "", euromap.PlansResponse{*plan})), nil
		}

		// Fallback: list plans for that date and match by service code
		return planByServiceCodeFallback(client, planID, date, serviceCode)
	}
}

func HandleGetEuromapPlans(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		fromDateTime := req.GetString("fromDateTime", "")
		if fromDateTime == "" {
			fromDateTime = time.Now().UTC().Format(isoDateTimeZero)
		}
		ranges := req.GetString("ranges", defaultRanges)
		if ranges == "" {
			ranges = defaultRanges
		}

		originCode := resolveStationCode(req.GetString("from", ""))
		destCode := resolveStationCode(req.GetString("to", ""))

		plans, err := client.GetPlans(fromDateTime, ranges)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf(euromapAPIErr, err)), nil
		}

		plans = filterPlansByRoute(plans, originCode, destCode)

		if len(plans) == 0 {
			label := fmt.Sprintf("from %s (ranges: %s)", fromDateTime, ranges)
			if originCode != "" || destCode != "" {
				label = fmt.Sprintf("%s → %s on %s", originCode, destCode, fromDateTime)
			}
			return mcp.NewToolResultText(fmt.Sprintf("No plans found for %s", label)), nil
		}
		return mcp.NewToolResultText(formatPlans(fromDateTime, ranges, plans)), nil
	}
}

func HandleGetEuromapTechnicalPlans(client *euromap.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		fromDateTime := req.GetString("fromDateTime", "")
		if fromDateTime == "" {
			fromDateTime = time.Now().UTC().Format(isoDateTimeZero)
		}
		ranges := req.GetString("ranges", defaultRanges)
		if ranges == "" {
			ranges = defaultRanges
		}

		plans, err := client.GetTechnicalPlans(fromDateTime, ranges)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf(euromapAPIErr, err)), nil
		}
		if len(plans) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No technical plans found from %s (ranges: %s)", fromDateTime, ranges)), nil
		}
		return mcp.NewToolResultText(formatTechnicalPlans(fromDateTime, ranges, plans)), nil
	}
}

// ── Station alias resolution ──────────────────────────────────────────────────

var stationAliases = map[string]string{
	// UK
	"london":               "SPX",
	"st pancras":           "SPX",
	"st pancras international": "SPX",
	// France
	"paris":                "PNO",
	"paris nord":           "PNO",
	"paris gare du nord":   "PNO",
	"lille":                "LEW",
	"lille europe":         "LEW",
	"calais":               "FTN",
	"calais frethun":       "FTN",
	"marne la vallee":      "MVC",
	// Belgium
	"brussels":             "BRU",
	"brussels midi":        "BRU",
	"bruxelles midi":       "BRU",
	"bruxelles":            "BRU",
	"liege":                "LIE",
	"liège":                "LIE",
	// Netherlands
	"amsterdam":            "AMS",
	"amsterdam centraal":   "AMS",
	"rotterdam":            "RDM",
	"rotterdam centraal":   "RDM",
}

// resolveStationCode returns the upper-case short code for a station name or
// passes through an already-uppercase code (e.g. "BXL") unchanged.
func resolveStationCode(input string) string {
	if input == "" {
		return ""
	}
	lower := strings.ToLower(strings.TrimSpace(input))
	if code, ok := stationAliases[lower]; ok {
		return code
	}
	// If it looks like a station code already (2-3 uppercase letters), use it.
	return strings.ToUpper(input)
}

// planMatchesRoute returns true when the plan's station list contains both
// originCode and destCode, with originCode appearing before destCode.
func planMatchesRoute(p euromap.Plan, originCode, destCode string) bool {
	originSeq := -1
	destSeq := -1
	for _, s := range p.Stations {
		if strings.EqualFold(s.ShortCode, originCode) {
			originSeq = s.SequenceNumber
		}
		if strings.EqualFold(s.ShortCode, destCode) {
			destSeq = s.SequenceNumber
		}
	}
	if originCode != "" && originSeq < 0 {
		return false
	}
	if destCode != "" && destSeq < 0 {
		return false
	}
	if originCode != "" && destCode != "" {
		return originSeq < destSeq
	}
	return true
}

// filterPlansByRoute returns only plans that match origin and/or destination.
func filterPlansByRoute(plans euromap.PlansResponse, originCode, destCode string) euromap.PlansResponse {
	if originCode == "" && destCode == "" {
		return plans
	}
	out := make(euromap.PlansResponse, 0, len(plans))
	for _, p := range plans {
		if planMatchesRoute(p, originCode, destCode) {
			out = append(out, p)
		}
	}
	return out
}

// ── Handler helpers ───────────────────────────────────────────────────────────

// resolvePlanID derives planID, date (YYYYMMDD), and serviceCode from the
// three optional inputs the LLM may supply in any combination.
func resolvePlanID(planID, date, serviceCode string) (id, d, svc string, err error) {
	if planID != "" {
		parts := strings.SplitN(planID, "-", 2)
		if len(parts) == 2 {
			return planID, parts[0], parts[1], nil
		}
		return planID, "", "", nil
	}
	if serviceCode == "" {
		return "", "", "", fmt.Errorf("provide either planID or serviceCode (and optionally date)")
	}
	if date == "" {
		date = time.Now().UTC().Format(compactDateFmt)
	}
	return date + "-" + serviceCode, date, serviceCode, nil
}

// compactToISO converts a YYYYMMDD date string to YYYY-MM-DDT00:00:00Z.
func compactToISO(date string) string {
	if len(date) == 8 {
		return fmt.Sprintf("%s-%s-%sT00:00:00Z", date[:4], date[4:6], date[6:8])
	}
	return time.Now().UTC().Format(isoDateTimeZero)
}

// planByServiceCodeFallback lists all plans for the given date and returns the
// one matching serviceCode, or a helpful list of available codes.
func planByServiceCodeFallback(client *euromap.Client, planID, date, serviceCode string) (*mcp.CallToolResult, error) {
	dateISO := compactToISO(date)
	allPlans, err := client.GetPlans(dateISO, defaultRanges)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Direct lookup for %s failed and listing plans also failed: %v", planID, err,
		)), nil
	}

	for _, p := range allPlans {
		if p.ServiceCode == serviceCode {
			return mcp.NewToolResultText(formatPlans(dateISO, defaultRanges, euromap.PlansResponse{p})), nil
		}
	}

	codes := make([]string, 0, len(allPlans))
	for _, p := range allPlans {
		codes = append(codes, p.ServiceCode)
	}
	return mcp.NewToolResultText(fmt.Sprintf(
		"No plan found for service %s on %s.\nAvailable services for that date: %s",
		serviceCode, date, strings.Join(codes, ", "),
	)), nil
}

// technicalPlanByServiceCodeFallback lists all technical plans for the date and
// returns the one matching serviceCode, or a helpful list of available codes.
func technicalPlanByServiceCodeFallback(client *euromap.Client, planID, date, serviceCode string) (*mcp.CallToolResult, error) {
	dateISO := compactToISO(date)
	allPlans, err := client.GetTechnicalPlans(dateISO, defaultRanges)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Direct lookup for %s failed and listing technical plans also failed: %v", planID, err,
		)), nil
	}

	for _, p := range allPlans {
		if p.ServiceCode == serviceCode {
			return mcp.NewToolResultText(formatTechnicalPlans(dateISO, defaultRanges, euromap.TechnicalPlansResponse{p})), nil
		}
	}

	codes := make([]string, 0, len(allPlans))
	for _, p := range allPlans {
		codes = append(codes, p.ServiceCode)
	}
	return mcp.NewToolResultText(fmt.Sprintf(
		"No technical plan found for service %s on %s.\n"+
			"Available technical services for that date: %s\n"+
			"HINT: If the user is asking about arrival/departure times at a station, try get_euromap_plan_by_id "+
			"which returns the commercial schedule with station stop times.",
		serviceCode, date, strings.Join(codes, ", "),
	)), nil
}

// ── Formatters ────────────────────────────────────────────────────────────────

// maxDetailedPlans is the threshold above which formatPlans switches to a
// concise text summary instead of emitting individual map cards.
const maxDetailedPlans = 5

// ukOriginCodes are Eurostar station codes located in the UK.
var ukOriginCodes = map[string]bool{"SPX": true, "EBF": true, "ASI": true}

func formatPlans(fromDateTime, ranges string, plans euromap.PlansResponse) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Eurostar Plans %s — %d service(s):\n\n", fmtISODate(fromDateTime), len(plans))
	if len(plans) > maxDetailedPlans {
		writePlansSummary(&sb, fromDateTime, plans)
	} else {
		for _, p := range plans {
			writePlanDetail(&sb, p)
		}
	}
	return sb.String()
}

type planStats struct {
	statusGroups   map[string][]string
	outbound       int
	firstDep       string
	lastDep        string
}

func aggregatePlans(plans euromap.PlansResponse) planStats {
	st := planStats{statusGroups: map[string][]string{}}
	for _, p := range plans {
		st.statusGroups[p.Status] = append(st.statusGroups[p.Status], p.ServiceCode)
		if len(p.Stations) > 0 && ukOriginCodes[strings.ToUpper(p.Stations[0].ShortCode)] {
			st.outbound++
		}
		updateDepRange(&st.firstDep, &st.lastDep, fmtISOTime(p.DepartureDatetime))
	}
	return st
}

func updateDepRange(first, last *string, dep string) {
	if dep == "" {
		return
	}
	if *first == "" || dep < *first {
		*first = dep
	}
	if *last == "" || dep > *last {
		*last = dep
	}
}

const codesPerRow = 10

func writeCodeBlock(sb *strings.Builder, codes []string) {
	for i, c := range codes {
		if i > 0 && i%codesPerRow == 0 {
			sb.WriteString("\n  ")
		} else if i > 0 {
			sb.WriteString(", ")
		} else {
			sb.WriteString("  ")
		}
		sb.WriteString(c)
	}
	sb.WriteByte('\n')
}

func writeStatusGroups(sb *strings.Builder, groups map[string][]string) {
	for _, status := range []string{"active", "cancelled", "suspended", "amended"} {
		if codes := groups[status]; len(codes) > 0 {
			fmt.Fprintf(sb, "%s (%d):\n", titleCase(status), len(codes))
			writeCodeBlock(sb, codes)
			delete(groups, status)
		}
	}
	for status, codes := range groups {
		fmt.Fprintf(sb, "%s (%d):\n", titleCase(status), len(codes))
		writeCodeBlock(sb, codes)
	}
}

func writePlansSummary(sb *strings.Builder, fromDateTime string, plans euromap.PlansResponse) {
	st := aggregatePlans(plans)
	inbound := len(plans) - st.outbound
	cancelledCodes := st.statusGroups["cancelled"]

	fmt.Fprintf(sb, "Direction: %d outbound (UK→Europe), %d inbound (Europe→UK)\n\n", st.outbound, inbound)
	writeStatusGroups(sb, st.statusGroups)

	sb.WriteString("\nHINT: Bulk result — the service codes above (Active/Cancelled/etc. lines) are the ONLY data available. " +
		"Rules: (1) If the user asked for a general status overview, respond with 2–4 sentences covering total, status breakdown, and direction split — do NOT list individual numbers. " +
		"(2) If the user explicitly asked for service numbers/codes, copy them verbatim from the status-group lines above — do NOT add departure times, stations, or any detail not present here. " +
		"NEVER invent departure times, station names, or route details — they are not in this result.")

	// Machine-readable block parsed by the frontend StatusSummaryCard.
	// Format: date|total|active|cancelled|outbound|inbound|firstDep|lastDep|cancelledCodes(csv)
	fmt.Fprintf(sb, "\nSTATUS_SUMMARY_START:%s|%d|%d|%d|%d|%d|%s|%s|%s\nSTATUS_SUMMARY_END\n",
		fmtISODate(fromDateTime),
		len(plans),
		len(st.statusGroups["active"]),
		len(cancelledCodes),
		st.outbound,
		inbound,
		st.firstDep,
		st.lastDep,
		strings.Join(cancelledCodes, ","),
	)
}

func writePlanDetail(sb *strings.Builder, p euromap.Plan) {
	dep := fmtISOTime(p.DepartureDatetime)
	arr := fmtISOTime(p.ArrivalDatetime)

	fmt.Fprintf(sb, "Plan %s | %s | Service %s | %s\n", p.PlanID, titleCase(p.PlanType), p.ServiceCode, p.Status)
	fmt.Fprintf(sb, "Departs: %s | Arrives: %s | %d stations\n", dep, arr, len(p.Stations))
	for _, s := range p.Stations {
		fmt.Fprintf(sb, "  %d. %s (%s, %s)", s.SequenceNumber, s.ShortCode, s.StopType, s.Country)
		if s.DepartureDatetime != "" {
			fmt.Fprintf(sb, " dep:%s", fmtISOTime(s.DepartureDatetime))
		}
		if s.ArrivalDatetime != "" {
			fmt.Fprintf(sb, " arr:%s", fmtISOTime(s.ArrivalDatetime))
		}
		fmt.Fprintln(sb)
	}

	fmt.Fprintf(sb, "PLAN_START:%s|%s|%s|%s|%s|%s\n", p.PlanID, p.PlanType, p.ServiceCode, p.Status, dep, arr)
	for _, s := range p.Stations {
		fmt.Fprintf(sb, "MAP_STATION:%s|%s|%s|%s|%s|%s\n",
			s.ShortCode, s.StopType, s.Latitude, s.Longitude,
			fmtISOTime(s.DepartureDatetime), fmtISOTime(s.ArrivalDatetime),
		)
	}
	fmt.Fprintln(sb, "PLAN_END")
	fmt.Fprintln(sb)
}

func passagePointTimes(pp euromap.PassagePoint) (dep, arr string) {
	if pp.DepartureTime != nil {
		dep = fmtISOTime(pp.DepartureTime.TheoreticalDateTime)
	}
	if pp.ArrivalTime != nil {
		arr = fmtISOTime(pp.ArrivalTime.TheoreticalDateTime)
	}
	return
}

func writeTechnicalPlan(sb *strings.Builder, p euromap.TechnicalPlan) {
	fmt.Fprintf(sb, "Plan %s | %s | Service %s | %s | %s\n",
		p.PlanID, titleCase(p.PlanType), p.ServiceCode, p.Status, p.TravelDate)
	fmt.Fprintf(sb, "Route: %s → %s | %d passage points\n",
		p.Origin.ShortCode, p.Destination.ShortCode, len(p.PassagePoints))
	for _, pp := range p.PassagePoints {
		name := pp.Place.Description["en"]
		dep, arr := passagePointTimes(pp)
		fmt.Fprintf(sb, "  %d. %s \"%s\" (%s, %s)",
			pp.SequenceNumber, pp.Place.StationInfo.ShortCode, name, pp.StopType, pp.Place.Country)
		if dep != "" {
			fmt.Fprintf(sb, " dep:%s", dep)
		}
		if arr != "" {
			fmt.Fprintf(sb, " arr:%s", arr)
		}
		fmt.Fprintln(sb)
	}

	fmt.Fprintf(sb, "TECH_PLAN_START:%s|%s|%s|%s|%s|%s|%s\n",
		p.PlanID, p.PlanType, p.ServiceCode, p.Status, p.TravelDate,
		p.Origin.ShortCode, p.Destination.ShortCode)
	for _, pp := range p.PassagePoints {
		name := pp.Place.Description["en"]
		dep, arr := passagePointTimes(pp)
		fmt.Fprintf(sb, "MAP_STATION:%s|%s|%.6f|%.6f|%s|%s|%s\n",
			pp.Place.StationInfo.ShortCode, pp.StopType,
			pp.Place.Latitude, pp.Place.Longitude, dep, arr, name,
		)
	}
	fmt.Fprintln(sb, "TECH_PLAN_END")
	fmt.Fprintln(sb)
}

func formatTechnicalPlans(fromDateTime, ranges string, plans euromap.TechnicalPlansResponse) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Eurostar Technical Plans from %s (ranges: %s) — %d result(s):\n\n", fromDateTime, ranges, len(plans))
	for _, p := range plans {
		writeTechnicalPlan(&sb, p)
	}
	return sb.String()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func fmtISODate(dt string) string {
	if len(dt) >= 10 {
		return dt[:10]
	}
	return dt
}

func fmtISOTime(dt string) string {
	if dt == "" {
		return ""
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, dt); err == nil {
			return t.UTC().Format("15:04")
		}
	}
	return dt
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
