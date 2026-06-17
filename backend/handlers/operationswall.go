package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type OperationsWallResponse struct {
	Overview     OperationsOverview       `json:"overview"`
	Eurostar     OperationsEurostar       `json:"eurostar"`
	TFL          OperationsTFL            `json:"tfl"`
	SNCF         OperationsSNCF           `json:"sncf"`
	NationalRail OperationsNationalRail   `json:"nationalRail"`
	Paris        OperationsParis          `json:"paris"`
	Correlations []OperationsCorrelation  `json:"correlations"`
	Propagations []OperationsPropagation  `json:"propagations"`
	TransferMap  []OperationsTransferNode `json:"transferMap"`
	FetchedAt    string                   `json:"fetchedAt"`
	Errors       map[string]string        `json:"errors,omitempty"`
}

type OperationsOverview struct {
	Narrative        string `json:"narrative"`
	NetworksLive     int    `json:"networksLive"`
	ActiveServices   int    `json:"activeServices"`
	WatchedServices  int    `json:"watchedServices"`
	NetworkAlerts    int    `json:"networkAlerts"`
	CrewCoverage     int    `json:"crewCoverage"`
	DisruptionPoints int    `json:"disruptionPoints"`
}

type OperationsEurostar struct {
	Trains        []EuromapPlan  `json:"trains"`
	Crew          []EnrichedCrew `json:"crew"`
	ServicesToday int            `json:"servicesToday"`
	Active        int            `json:"active"`
	Watched       int            `json:"watched"`
	Cancelled     int            `json:"cancelled"`
	CrewCoverage  int            `json:"crewCoverage"`
	Issues        []string       `json:"issues,omitempty"`
}

type OperationsTFL struct {
	Lines       []TFLLineStatus   `json:"lines"`
	Roads       []TFLRoadStatus   `json:"roads"`
	Buses       []TFLBusLine      `json:"buses"`
	GoodLines   int               `json:"goodLines"`
	Disrupted   int               `json:"disrupted"`
	RoadIssues  int               `json:"roadIssues"`
	ToolSources []string          `json:"toolSources"`
	Errors      map[string]string `json:"errors,omitempty"`
}

type OperationsSNCF struct {
	Boards      []SNCFStationBoard `json:"boards"`
	Incidents   []SNCFIncident     `json:"incidents"`
	Delayed     int                `json:"delayed"`
	Services    int                `json:"services"`
	ToolSources []string           `json:"toolSources"`
	Errors      map[string]string  `json:"errors,omitempty"`
}

type OperationsNationalRail struct {
	Hubs       []NationalRailHub     `json:"hubs"`
	Services   []NationalRailService `json:"services"`
	Alerts     []NationalRailAlert   `json:"alerts"`
	Delayed    int                   `json:"delayed"`
	Cancelled  int                   `json:"cancelled"`
	ToolSource []string              `json:"toolSources"`
	Errors     map[string]string     `json:"errors,omitempty"`
}

type OperationsParis struct {
	Boards      []ParisTransitBoard `json:"boards"`
	Delayed     int                 `json:"delayed"`
	Lines       int                 `json:"lines"`
	ToolSources []string            `json:"toolSources"`
	Errors      map[string]string   `json:"errors,omitempty"`
}

type OperationsPropagation struct {
	ID               string   `json:"id"`
	Severity         string   `json:"severity"`
	Title            string   `json:"title"`
	Summary          string   `json:"summary"`
	PrimaryService   string   `json:"primaryService"`
	Origin           string   `json:"origin"`
	Destination      string   `json:"destination"`
	Departure        string   `json:"departure"`
	ImpactedNetworks []string `json:"impactedNetworks"`
	ImpactSummary    []string `json:"impactSummary"`
	Confidence       int      `json:"confidence"`
}

type OperationsTransferNode struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Group    string `json:"group"`
	Status   string `json:"status"`
	Headline string `json:"headline"`
	Value    string `json:"value"`
}

type OperationsCorrelation struct {
	ID          string   `json:"id"`
	Severity    string   `json:"severity"`
	Headline    string   `json:"headline"`
	Explanation string   `json:"explanation"`
	Cause       string   `json:"cause"`
	Effect      string   `json:"effect"`
	Networks    []string `json:"networks"`
	Confidence  int      `json:"confidence"`
}

func (h *Handler) GetOperationsWall(c *gin.Context) {
	ctx := c.Request.Context()
	var (
		response OperationsWallResponse
		mu       sync.Mutex
		wg       sync.WaitGroup
	)

	response.Errors = make(map[string]string)

	wg.Add(5)

	go func() {
		defer wg.Done()
		data, errs := fetchEurostarWall(ctx)
		mu.Lock()
		response.Eurostar = data
		copyErrors(response.Errors, errs)
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		data, errs := h.fetchTFLWall(ctx)
		mu.Lock()
		response.TFL = data
		copyErrors(response.Errors, errs)
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		data, errs := h.fetchSNCFWall(ctx)
		mu.Lock()
		response.SNCF = data
		copyErrors(response.Errors, errs)
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		data, errs := h.fetchNationalRailWall(ctx)
		mu.Lock()
		response.NationalRail = data
		copyErrors(response.Errors, errs)
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		data, errs := h.fetchParisWall(ctx)
		mu.Lock()
		response.Paris = data
		copyErrors(response.Errors, errs)
		mu.Unlock()
	}()

	wg.Wait()

	response.Correlations = buildCorrelations(response.Eurostar, response.TFL, response.SNCF, response.NationalRail, response.Paris)
	response.Propagations = buildPropagations(response.Eurostar, response.TFL, response.SNCF, response.NationalRail, response.Paris)
	response.TransferMap = buildTransferMap(response.Eurostar, response.TFL, response.SNCF, response.NationalRail, response.Paris)
	response.Overview = buildOverview(response.Eurostar, response.TFL, response.SNCF, response.NationalRail, response.Paris, response.Propagations)
	response.FetchedAt = time.Now().UTC().Format(time.RFC3339)

	if response.Overview.NetworksLive == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "No live network feeds are currently available", "errors": response.Errors})
		return
	}
	c.JSON(http.StatusOK, response)
}

func fetchEurostarWall(ctx context.Context) (OperationsEurostar, map[string]string) {
	out := OperationsEurostar{}
	errs := make(map[string]string)
	date := time.Now().Format("2006-01-02")
	params := url.Values{}
	params.Set("fromDateTime", date+"T00:00:00Z")
	params.Set("range", "thalys,channel")

	body, err := eclient().get("/v1/plans", params)
	if err != nil {
		errs["eurostar.trains"] = err.Error()
	} else if err := json.Unmarshal(body, &out.Trains); err != nil {
		errs["eurostar.trains"] = "decode error"
	}

	actBody, err := sotclient().get("/v1/activities?operationalDate=" + date)
	if err != nil {
		errs["eurostar.crew"] = err.Error()
	} else {
		var activities []CrewActivity
		if err := json.Unmarshal(actBody, &activities); err != nil {
			errs["eurostar.crew"] = "decode activities"
		} else {
			out.Crew = enrichCrewActivities(ctx, activities)
		}
	}

	out.ServicesToday = len(out.Trains)
	now := time.Now().UnixMilli()
	crewServices := make(map[string]struct{})
	for _, member := range out.Crew {
		crewServices[normalizeServiceCode(member.ServiceCode)] = struct{}{}
	}
	for _, plan := range out.Trains {
		if isTrainActive(plan, now) {
			out.Active++
		}
		if isWatchStatus(plan.Status) {
			out.Watched++
		}
		if isCancelledStatus(plan.Status) {
			out.Cancelled++
		}
		if _, ok := crewServices[normalizeServiceCode(plan.ServiceCode)]; ok {
			out.CrewCoverage++
		}
	}
	if _, ok := errs["eurostar.trains"]; ok {
		out.Issues = append(out.Issues, "Euromap plans unavailable")
	}
	if _, ok := errs["eurostar.crew"]; ok {
		out.Issues = append(out.Issues, "Start-on-Time crew unavailable")
	}
	return out, errs
}

func enrichCrewActivities(_ context.Context, activities []CrewActivity) []EnrichedCrew {
	if len(activities) == 0 {
		return nil
	}
	seen := map[string]bool{}
	var ids []string
	for _, activity := range activities {
		if activity.CrewID != "" && !seen[activity.CrewID] {
			seen[activity.CrewID] = true
			ids = append(ids, activity.CrewID)
		}
	}

	agentMap := map[string]CrewAgent{}
	if len(ids) > 0 {
		if agentBody, err := sotclient().get("/v1/agents?employeeIds=" + strings.Join(ids, ",")); err == nil {
			var agents []CrewAgent
			if json.Unmarshal(agentBody, &agents) == nil {
				for _, agent := range agents {
					agentMap[agent.EmployeeID] = agent
				}
			}
		}
	}

	result := make([]EnrichedCrew, 0, len(activities))
	for _, activity := range activities {
		agent := agentMap[activity.CrewID]
		result = append(result, EnrichedCrew{
			CrewType:    activity.CrewType,
			CrewID:      activity.CrewID,
			FirstName:   agent.FirstName,
			LastName:    agent.LastName,
			Phone:       agent.Phone,
			HomeDepot:   agent.HomeDepot,
			ServiceCode: activity.ServiceCode,
			Origin:      activity.Origin,
			Destination: activity.Destination,
			Departure:   fmtSOTTime(activity.DepartureDatetime),
			Arrival:     fmtSOTTime(activity.ArrivalDatetime),
		})
	}
	return result
}

func (h *Handler) fetchTFLWall(ctx context.Context) (OperationsTFL, map[string]string) {
	out := OperationsTFL{Errors: make(map[string]string)}
	statusRaw, statusErr := h.mcp.CallTool(ctx, "get_status_by_mode", `{"modes":"tube,dlr,overground,elizabeth-line"}`)
	if statusErr != nil {
		out.Errors["lines"] = statusErr.Error()
	}
	roadsRaw, roadsErr := h.mcp.CallTool(ctx, "get_tfl_roads", `{}`)
	if roadsErr != nil {
		out.Errors["roads"] = roadsErr.Error()
	}
	busesRaw, busesErr := h.mcp.CallTool(ctx, "get_all_bus_lines", `{}`)
	if busesErr != nil {
		out.Errors["buses"] = busesErr.Error()
	}
	out.Lines = parseTFLStatuses(statusRaw)
	out.Roads = parseTFLRoads(roadsRaw)
	out.Buses = parseTFLBusLines(busesRaw)
	for _, line := range out.Lines {
		if goodLineStatus(line) {
			out.GoodLines++
		} else {
			out.Disrupted++
		}
	}
	for _, road := range out.Roads {
		if !strings.EqualFold(road.StatusSeverity, "good") {
			out.RoadIssues++
		}
	}
	out.ToolSources = []string{"get_status_by_mode", "get_tfl_roads", "get_all_bus_lines"}
	return out, out.Errors
}

func (h *Handler) fetchSNCFWall(ctx context.Context) (OperationsSNCF, map[string]string) {
	out := OperationsSNCF{Errors: make(map[string]string)}
	for _, station := range sncfDashboardStations {
		args, _ := json.Marshal(map[string]any{"station": station, "count": 8})
		raw, err := h.mcp.CallTool(ctx, "get_sncf_departures", string(args))
		if err != nil {
			out.Errors["sncf."+station] = err.Error()
			continue
		}
		if board := parseSNCFDepartures(raw); board.Station != "" {
			out.Boards = append(out.Boards, board)
		}
	}
	disruptionsRaw, err := h.mcp.CallTool(context.WithoutCancel(ctx), "get_sncf_disruptions", `{}`)
	if err != nil {
		out.Errors["sncf.disruptions"] = err.Error()
	}
	out.Incidents = parseSNCFIncidents(disruptionsRaw)
	for _, board := range out.Boards {
		out.Services += len(board.Services)
		for _, service := range board.Services {
			if service.Delay > 0 {
				out.Delayed++
			}
		}
	}
	out.ToolSources = []string{"get_sncf_departures", "get_sncf_disruptions"}
	return out, out.Errors
}

func (h *Handler) fetchNationalRailWall(ctx context.Context) (OperationsNationalRail, map[string]string) {
	out := OperationsNationalRail{Errors: make(map[string]string)}
	raw, err := h.mcp.CallTool(ctx, "get_national_rail_dashboard", `{"count":6}`)
	if err != nil {
		out.Errors["national-rail.dashboard"] = err.Error()
		return out, out.Errors
	}
	out.Hubs, out.Services, out.Alerts = parseNationalRailDashboard(raw)
	for _, hub := range out.Hubs {
		out.Delayed += hub.Delayed
		out.Cancelled += hub.Cancelled
	}
	out.ToolSource = []string{"get_national_rail_dashboard"}
	return out, out.Errors
}

func (h *Handler) fetchParisWall(ctx context.Context) (OperationsParis, map[string]string) {
	out := OperationsParis{Errors: make(map[string]string)}
	for _, station := range parisDashboardStations {
		args, _ := json.Marshal(map[string]any{"station": station, "count": 6})
		raw, err := h.mcp.CallTool(ctx, "get_paris_metro_departures", string(args))
		if err != nil {
			out.Errors["paris."+station] = err.Error()
			continue
		}
		if board := parseParisTransitBoard(raw); board.Station != "" {
			out.Boards = append(out.Boards, board)
		}
	}
	lines := make(map[string]struct{})
	for _, board := range out.Boards {
		for _, service := range board.Services {
			if service.Delay > 0 {
				out.Delayed++
			}
			if service.Line != "" {
				lines[service.Line] = struct{}{}
			}
		}
	}
	out.Lines = len(lines)
	out.ToolSources = []string{"get_paris_metro_departures"}
	return out, out.Errors
}

func buildOverview(eurostar OperationsEurostar, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis, propagations []OperationsPropagation) OperationsOverview {
	networksLive := 0
	if eurostar.ServicesToday > 0 || len(eurostar.Crew) > 0 {
		networksLive++
	}
	if len(tfl.Lines) > 0 || len(tfl.Roads) > 0 || len(tfl.Buses) > 0 {
		networksLive++
	}
	if len(sncf.Boards) > 0 || len(sncf.Incidents) > 0 {
		networksLive++
	}
	if len(national.Hubs) > 0 || len(national.Services) > 0 {
		networksLive++
	}
	if len(paris.Boards) > 0 {
		networksLive++
	}

	alerts := eurostar.Watched + tfl.Disrupted + tfl.RoadIssues + len(sncf.Incidents) + national.Delayed + national.Cancelled + len(national.Alerts) + paris.Delayed
	narrative := "Cross-border networks are flowing."
	switch {
	case len(propagations) > 0:
		narrative = propagations[0].Title
	case alerts > 12:
		narrative = "Several city and rail networks need attention across the wall."
	case alerts > 0:
		narrative = "A few live issues are visible across the cross-border picture."
	}

	return OperationsOverview{
		Narrative:        narrative,
		NetworksLive:     networksLive,
		ActiveServices:   eurostar.Active + sncf.Services + len(national.Services) + parisBoardServiceCount(paris.Boards),
		WatchedServices:  eurostar.Watched + sncf.Delayed + national.Delayed + paris.Delayed,
		NetworkAlerts:    len(sncf.Incidents) + len(national.Alerts) + tfl.Disrupted + tfl.RoadIssues,
		CrewCoverage:     eurostar.CrewCoverage,
		DisruptionPoints: len(propagations),
	}
}

func buildTransferMap(eurostar OperationsEurostar, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis) []OperationsTransferNode {
	return []OperationsTransferNode{
		{
			ID:       "eurostar",
			Label:    "Eurostar",
			Group:    "cross-border",
			Status:   severityForCounts(eurostar.Watched, eurostar.Cancelled),
			Headline: "Cross-Channel services",
			Value:    humanCount(eurostar.ServicesToday, "service", "services"),
		},
		{
			ID:       "tfl",
			Label:    "TfL",
			Group:    "uk-city",
			Status:   severityForCounts(tfl.Disrupted+tfl.RoadIssues, 0),
			Headline: "London city network",
			Value:    humanCount(tfl.GoodLines, "good line", "good lines"),
		},
		{
			ID:       "national-rail",
			Label:    "National Rail",
			Group:    "uk-national",
			Status:   severityForCounts(national.Delayed+national.Cancelled, 0),
			Headline: "UK onward movement",
			Value:    humanCount(len(national.Hubs), "hub", "hubs"),
		},
		{
			ID:       "paris",
			Label:    "Paris RER",
			Group:    "fr-city",
			Status:   severityForCounts(paris.Delayed, 0),
			Headline: "Paris interchange hubs",
			Value:    humanCount(len(paris.Boards), "board", "boards"),
		},
		{
			ID:       "sncf",
			Label:    "SNCF",
			Group:    "fr-national",
			Status:   severityForCounts(sncf.Delayed+len(sncf.Incidents), 0),
			Headline: "French onward movement",
			Value:    humanCount(len(sncf.Boards), "hub", "hubs"),
		},
	}
}

func buildPropagations(eurostar OperationsEurostar, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis) []OperationsPropagation {
	var out []OperationsPropagation
	var watched []EuromapPlan
	for _, plan := range eurostar.Trains {
		if isWatchStatus(plan.Status) {
			watched = append(watched, plan)
		}
	}
	sort.Slice(watched, func(i, j int) bool {
		return watched[i].DepartureDatetime < watched[j].DepartureDatetime
	})

	for _, plan := range watched {
		origin := stationNameFromPlan(plan, true)
		destination := stationNameFromPlan(plan, false)
		impacts, networks := downstreamImpacts(destination, tfl, sncf, national, paris)
		if len(impacts) == 0 {
			impacts, networks = upstreamImpacts(origin, tfl, sncf, national, paris)
		}
		if len(impacts) == 0 {
			continue
		}
		confidence := 55 + len(impacts)*10
		if confidence > 95 {
			confidence = 95
		}
		out = append(out, OperationsPropagation{
			ID:               "eurostar-" + normalizeServiceCode(plan.ServiceCode),
			Severity:         severityFromStatus(plan.Status),
			Title:            propagationTitle(plan, origin, destination),
			Summary:          propagationSummary(plan, origin, destination, impacts),
			PrimaryService:   plan.ServiceCode,
			Origin:           origin,
			Destination:      destination,
			Departure:        plan.DepartureDatetime,
			ImpactedNetworks: networks,
			ImpactSummary:    impacts,
			Confidence:       confidence,
		})
		if len(out) >= 4 {
			break
		}
	}

	if len(out) == 0 {
		out = append(out, OperationsPropagation{
			ID:               "system-flow",
			Severity:         "good",
			Title:            "No cross-border knock-on issue is obvious right now",
			Summary:          "Eurostar, city networks, and national onward feeds are all available, with no late Eurostar currently standing out as a likely transfer problem.",
			ImpactedNetworks: []string{"Eurostar", "TfL", "National Rail", "Paris RER", "SNCF"},
			ImpactSummary: []string{
				networkPulseLine("TfL", tfl.Disrupted+tfl.RoadIssues, len(tfl.Lines)),
				networkPulseLine("National Rail", national.Delayed+national.Cancelled, len(national.Hubs)),
				networkPulseLine("Paris RER", paris.Delayed, len(paris.Boards)),
				networkPulseLine("SNCF", sncf.Delayed+len(sncf.Incidents), len(sncf.Boards)),
			},
			Confidence: 80,
		})
	}
	return out
}

func buildCorrelations(eurostar OperationsEurostar, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis) []OperationsCorrelation {
	var out []OperationsCorrelation

	if affected := parisGareDuNordDelayCount(paris); affected > 0 {
		out = append(out, OperationsCorrelation{
			ID:          "paris-gdn-eurostar",
			Severity:    severityForCounts(affected, 0),
			Headline:    "Paris Gare du Nord disruption likely affects Eurostar arrivals",
			Explanation: "Delayed Paris RER departures at Gare du Nord suggest a weaker interchange environment for Eurostar arrivals into Paris.",
			Cause:       humanCount(affected, "late departure", "late departures") + " on the Gare du Nord board",
			Effect:      "Paris arrivals from Eurostar may face slower onward distribution through the station",
			Networks:    []string{"Paris RER", "Eurostar"},
			Confidence:  81,
		})
	}

	if sncf.Delayed > 0 && len(sncf.Incidents) > 0 && stationBoardHasDelay(sncf.Boards, "Lyon") {
		out = append(out, OperationsCorrelation{
			ID:          "lyon-sncf-alerts",
			Severity:    severityForCounts(sncf.Delayed+len(sncf.Incidents), 0),
			Headline:    "Lyon Part-Dieu delays are raising SNCF network alert count",
			Explanation: "The Lyon Part-Dieu board is showing delayed departures while SNCF incidents are already active, so the wall treats Lyon as a likely contributor to the national alert picture.",
			Cause:       "Delayed departures at Lyon Part-Dieu alongside active SNCF incidents",
			Effect:      humanCount(len(sncf.Incidents), "SNCF alert", "SNCF alerts") + " are being reinforced by disruption around Lyon",
			Networks:    []string{"SNCF"},
			Confidence:  78,
		})
	}

	if tfl.Disrupted > 0 && hasLondonEurostarAccessIssue(tfl) {
		out = append(out, OperationsCorrelation{
			ID:          "tfl-eurostar-access",
			Severity:    severityForCounts(tfl.Disrupted+tfl.RoadIssues, 0),
			Headline:    "TfL line issues may affect London Eurostar access",
			Explanation: "Disrupted Tube or Elizabeth line services in London can make it harder to reach St Pancras and the wider Eurostar access corridor.",
			Cause:       affectedTfLAccessSummary(tfl),
			Effect:      "Passengers heading to or from Eurostar may need longer access and egress times in London",
			Networks:    []string{"TfL", "Eurostar"},
			Confidence:  84,
		})
	}

	if national.Delayed+national.Cancelled > 0 && eurostar.Active > 0 {
		out = append(out, OperationsCorrelation{
			ID:          "uk-arrivals-mainline",
			Severity:    severityForCounts(national.Delayed+national.Cancelled, national.Cancelled),
			Headline:    "UK mainline delays may weaken onward movement from Eurostar arrivals",
			Explanation: "National Rail delays across the monitored London terminals raise the risk that arriving Eurostar passengers will face slower onward domestic connections.",
			Cause:       humanCount(national.Delayed+national.Cancelled, "mainline issue", "mainline issues") + " across monitored hubs",
			Effect:      "London arrivals from Eurostar may see a less reliable handoff into UK rail",
			Networks:    []string{"National Rail", "Eurostar"},
			Confidence:  72,
		})
	}

	if len(out) == 0 {
		out = append(out, OperationsCorrelation{
			ID:          "correlation-calm",
			Severity:    "good",
			Headline:    "No strong live correlation is standing out across the wall",
			Explanation: "The wall is still watching for shared pressure points between Eurostar, city networks, and national rail, but nothing currently crosses the threshold for a strong incident link.",
			Cause:       "Current feeds look relatively independent",
			Effect:      "No major cross-network trigger is being highlighted right now",
			Networks:    []string{"Eurostar", "TfL", "National Rail", "Paris RER", "SNCF"},
			Confidence:  76,
		})
	}

	if len(out) > 4 {
		out = out[:4]
	}
	return out
}

func downstreamImpacts(place string, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis) ([]string, []string) {
	lower := strings.ToLower(place)
	var impacts []string
	var networks []string
	if strings.Contains(lower, "paris") || strings.Contains(lower, "nord") {
		if paris.Delayed > 0 {
			impacts = append(impacts, networkPulseLine("Paris RER", paris.Delayed, len(paris.Boards)))
			networks = append(networks, "Paris RER")
		}
		if len(sncf.Incidents) > 0 || sncf.Delayed > 0 {
			impacts = append(impacts, networkPulseLine("SNCF", sncf.Delayed+len(sncf.Incidents), len(sncf.Boards)))
			networks = append(networks, "SNCF")
		}
	}
	if strings.Contains(lower, "london") || strings.Contains(lower, "pancras") || strings.Contains(lower, "ebbsfleet") || strings.Contains(lower, "ashford") {
		if national.Delayed+national.Cancelled > 0 {
			impacts = append(impacts, networkPulseLine("National Rail", national.Delayed+national.Cancelled, len(national.Hubs)))
			networks = append(networks, "National Rail")
		}
		if tfl.Disrupted+tfl.RoadIssues > 0 {
			impacts = append(impacts, networkPulseLine("TfL", tfl.Disrupted+tfl.RoadIssues, len(tfl.Lines)))
			networks = append(networks, "TfL")
		}
	}
	return impacts, uniqueStrings(networks)
}

func parisGareDuNordDelayCount(paris OperationsParis) int {
	for _, board := range paris.Boards {
		if strings.Contains(strings.ToLower(board.Station), "gare du nord") {
			delayed := 0
			for _, service := range board.Services {
				if service.Delay > 0 {
					delayed++
				}
			}
			return delayed
		}
	}
	return 0
}

func stationBoardHasDelay(boards []SNCFStationBoard, pattern string) bool {
	pattern = strings.ToLower(pattern)
	for _, board := range boards {
		if !strings.Contains(strings.ToLower(board.Station), pattern) {
			continue
		}
		for _, service := range board.Services {
			if service.Delay > 0 {
				return true
			}
		}
	}
	return false
}

func hasLondonEurostarAccessIssue(tfl OperationsTFL) bool {
	for _, line := range tfl.Lines {
		if !isAccessLine(line.ID) {
			continue
		}
		if !goodLineStatus(line) {
			return true
		}
	}
	return false
}

func isAccessLine(id string) bool {
	switch strings.ToLower(id) {
	case "northern", "victoria", "circle", "metropolitan", "hammersmith-city", "elizabeth":
		return true
	default:
		return false
	}
}

func affectedTfLAccessSummary(tfl OperationsTFL) string {
	var affected []string
	for _, line := range tfl.Lines {
		if isAccessLine(line.ID) && !goodLineStatus(line) {
			affected = append(affected, line.Name)
		}
	}
	if len(affected) == 0 {
		return humanCount(tfl.Disrupted+tfl.RoadIssues, "TfL issue", "TfL issues") + " near London access routes"
	}
	if len(affected) > 3 {
		affected = affected[:3]
	}
	return strings.Join(affected, ", ") + " disrupted"
}

func upstreamImpacts(place string, tfl OperationsTFL, sncf OperationsSNCF, national OperationsNationalRail, paris OperationsParis) ([]string, []string) {
	return downstreamImpacts(place, tfl, sncf, national, paris)
}

func propagationTitle(plan EuromapPlan, origin, destination string) string {
	switch severityFromStatus(plan.Status) {
	case "critical":
		return "Eurostar " + plan.ServiceCode + " is cancelled or suspended across the connection chain"
	case "warning":
		return "Eurostar " + plan.ServiceCode + " may ripple into onward connections"
	default:
		return "Eurostar " + plan.ServiceCode + " is part of the live cross-border picture"
	}
}

func propagationSummary(plan EuromapPlan, origin, destination string, impacts []string) string {
	status := strings.ToLower(strings.ReplaceAll(plan.Status, "_", " "))
	return "Service " + plan.ServiceCode + " from " + origin + " to " + destination + " is currently " + status + ", so the wall is watching its likely effect on " + strings.ToLower(strings.Join(impacts, ", ")) + "."
}

func stationNameFromPlan(plan EuromapPlan, origin bool) string {
	var station *EuromapStation
	if origin {
		for i := range plan.Stations {
			if strings.EqualFold(plan.Stations[i].StopType, "origin") {
				station = &plan.Stations[i]
				break
			}
		}
		if station == nil && len(plan.Stations) > 0 {
			station = &plan.Stations[0]
		}
	} else {
		for i := range plan.Stations {
			if strings.EqualFold(plan.Stations[i].StopType, "destination") {
				station = &plan.Stations[i]
				break
			}
		}
		if station == nil && len(plan.Stations) > 0 {
			station = &plan.Stations[len(plan.Stations)-1]
		}
	}
	if station == nil {
		return "Unknown"
	}
	return stationLabel(station.ShortCode)
}

func stationLabel(code string) string {
	switch strings.ToUpper(code) {
	case "SPX":
		return "London St Pancras"
	case "PNO":
		return "Paris Gare du Nord"
	case "BXL", "BRU":
		return "Brussels-Midi"
	case "ASD", "AMS":
		return "Amsterdam Centraal"
	case "RTD", "RDM":
		return "Rotterdam Centraal"
	case "LIL", "LEW":
		return "Lille Europe"
	case "EBF", "EBD":
		return "Ebbsfleet International"
	case "ASH", "AFK":
		return "Ashford International"
	default:
		return code
	}
}

func normalizeServiceCode(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimLeft(value, "0")
	if value == "" {
		return "0"
	}
	return value
}

func isTrainActive(plan EuromapPlan, nowMillis int64) bool {
	dep := parseTimeMillis(plan.DepartureDatetime)
	arr := parseTimeMillis(plan.ArrivalDatetime)
	return dep > 0 && arr > 0 && dep <= nowMillis && nowMillis <= arr
}

func parseTimeMillis(value string) int64 {
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

func isWatchStatus(status string) bool {
	value := strings.ToUpper(status)
	return strings.Contains(value, "DELAY") || strings.Contains(value, "CANCEL") || strings.Contains(value, "DELETE") || strings.Contains(value, "SUSPEND") || strings.Contains(value, "DISRUPT")
}

func isCancelledStatus(status string) bool {
	value := strings.ToUpper(status)
	return strings.Contains(value, "CANCEL") || strings.Contains(value, "DELETE") || strings.Contains(value, "SUSPEND")
}

func severityFromStatus(status string) string {
	value := strings.ToUpper(status)
	switch {
	case strings.Contains(value, "CANCEL") || strings.Contains(value, "DELETE") || strings.Contains(value, "SUSPEND"):
		return "critical"
	case strings.Contains(value, "DELAY") || strings.Contains(value, "DISRUPT"):
		return "warning"
	default:
		return "good"
	}
}

func severityForCounts(primary int, critical int) string {
	switch {
	case critical > 0:
		return "critical"
	case primary > 0:
		return "warning"
	default:
		return "good"
	}
}

func goodLineStatus(line TFLLineStatus) bool {
	if len(line.LineStatuses) == 0 {
		return false
	}
	return line.LineStatuses[0].StatusSeverity >= 10
}

func copyErrors(target map[string]string, source map[string]string) {
	for key, value := range source {
		target[key] = value
	}
}

func humanCount(value int, singular, plural string) string {
	if value == 1 {
		return "1 " + singular
	}
	return strconv.Itoa(value) + " " + plural
}

func parisBoardServiceCount(boards []ParisTransitBoard) int {
	total := 0
	for _, board := range boards {
		total += len(board.Services)
	}
	return total
}

func networkPulseLine(label string, issues int, total int) string {
	switch {
	case total == 0:
		return label + " feed is still reconnecting"
	case issues <= 0:
		return label + " is currently calm"
	default:
		return label + " shows " + humanCount(issues, "issue", "issues")
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	var out []string
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
