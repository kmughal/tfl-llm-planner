package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type EurostarWatchlistItem struct {
	PlanID         string   `json:"planID"`
	ServiceCode    string   `json:"serviceCode"`
	Market         string   `json:"market"`
	Origin         string   `json:"origin"`
	Destination    string   `json:"destination"`
	Status         string   `json:"status"`
	Severity       string   `json:"severity"`
	DepartureTime  string   `json:"departureDateTime"`
	ArrivalTime    string   `json:"arrivalDateTime"`
	Active         bool     `json:"active"`
	Cancelled      bool     `json:"cancelled"`
	CrewLinked     bool     `json:"crewLinked"`
	CrewCount      int      `json:"crewCount"`
	PassengerLoad  int      `json:"passengerLoad"`
	LeadClass      string   `json:"leadClass"`
	RiskScore      int      `json:"riskScore"`
	Reasons        []string `json:"reasons"`
	RecommendedAsk string   `json:"recommendedAsk"`
}

type EurostarWatchlistResponse struct {
	Date        string                  `json:"date"`
	Services    int                     `json:"services"`
	Watched     int                     `json:"watched"`
	HighestRisk int                     `json:"highestRisk"`
	GeneratedAt string                  `json:"generatedAt"`
	Items       []EurostarWatchlistItem `json:"items"`
}

func (h *Handler) GetEurostarWatchlist(c *gin.Context) {
	useProjection := IsServiceEnabled("eurostar-projection")
	if !useProjection && !IsServiceEnabled("eurostar") {
		serviceDisabledJSON(c, "eurostar")
		return
	}
	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		date = time.Now().UTC().Format(dateFmt)
	}
	if _, err := time.Parse(dateFmt, date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date, use YYYY-MM-DD"})
		return
	}
	cacheKey := "eurostar/watchlist/" + date

	result, err := h.buildEurostarWatchlist(c.Request.Context(), date, useProjection)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	respondJSONAndCache(c, cacheKey, http.StatusOK, result)
}

func (h *Handler) buildEurostarWatchlist(ctx context.Context, date string, useProjection bool) (EurostarWatchlistResponse, error) {
	response := EurostarWatchlistResponse{
		Date:        date,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Items:       make([]EurostarWatchlistItem, 0, 12),
	}

	var plans []EuromapPlan
	if useProjection {
		var err error
		plans, err = projectionAsEuromapPlans(date)
		if err != nil {
			return response, err
		}
	} else {
		params := url.Values{}
		params.Set("fromDateTime", date+"T00:00:00Z")
		params.Set("range", "thalys,channel")

		body, err := eclient().get("/v1/plans", params)
		if err != nil {
			return response, err
		}

		if err := json.Unmarshal(body, &plans); err != nil {
			return response, err
		}
	}

	crewAvailable := false
	var activities []CrewActivity
	if actBody, err := sotclient().get("/v1/activities?operationalDate=" + date); err == nil {
		if err := json.Unmarshal(actBody, &activities); err == nil {
			crewAvailable = true
		}
	}

	traveler, _ := h.fetchTravelerSummaryForDate(ctx, date)
	crewByService := make(map[string][]EnrichedCrew)
	for _, member := range enrichCrewActivities(ctx, activities) {
		key := normalizeServiceCode(member.ServiceCode)
		crewByService[key] = append(crewByService[key], member)
	}

	travelerByService := make(map[string]TravelerServiceSummary)
	if traveler != nil {
		for _, item := range traveler.Items {
			travelerByService[normalizeServiceCode(item.ServiceCode)] = item
		}
	}

	now := time.Now().UnixMilli()
	for _, plan := range plans {
		key := normalizeServiceCode(plan.ServiceCode)
		crewMembers := crewByService[key]
		travelerItem, hasTraveler := travelerByService[key]

		reasons := make([]string, 0, 4)
		risk := 0
		active := isTrainActive(plan, now)
		cancelled := isCancelledStatus(plan.Status)

		if cancelled {
			risk += 85
			reasons = append(reasons, "Service is cancelled or suspended")
		} else if isWatchStatus(plan.Status) {
			risk += 58
			reasons = append(reasons, "Service status is not clear")
		}

		if active {
			risk += 8
			reasons = append(reasons, "Train is currently in motion")
		}

		if crewAvailable && len(crewMembers) == 0 {
			risk += 18
			reasons = append(reasons, "No crew roster match found")
		}

		if hasTraveler {
			switch {
			case travelerItem.TotalCount >= 850:
				risk += 18
				reasons = append(reasons, "Very high passenger load")
			case travelerItem.TotalCount >= 650:
				risk += 12
				reasons = append(reasons, "High passenger load")
			case travelerItem.TotalCount >= 450:
				risk += 7
			}
		}

		if risk < 18 {
			continue
		}

		item := EurostarWatchlistItem{
			PlanID:         plan.PlanID,
			ServiceCode:    plan.ServiceCode,
			Market:         stationNameFromPlan(plan, true) + " - " + stationNameFromPlan(plan, false),
			Origin:         stationNameFromPlan(plan, true),
			Destination:    stationNameFromPlan(plan, false),
			Status:         strings.TrimSpace(plan.Status),
			Severity:       severityFromStatus(plan.Status),
			DepartureTime:  plan.DepartureDatetime,
			ArrivalTime:    plan.ArrivalDatetime,
			Active:         active,
			Cancelled:      cancelled,
			CrewLinked:     len(crewMembers) > 0,
			CrewCount:      len(crewMembers),
			PassengerLoad:  travelerItem.TotalCount,
			LeadClass:      leadTravelerClass(travelerItem.Classes),
			RiskScore:      minInt(risk, 100),
			Reasons:        reasons,
			RecommendedAsk: buildEurostarWatchPrompt(plan, len(crewMembers) == 0, travelerItem.TotalCount),
		}

		response.Items = append(response.Items, item)
	}

	sort.Slice(response.Items, func(i, j int) bool {
		if response.Items[i].RiskScore == response.Items[j].RiskScore {
			return response.Items[i].DepartureTime < response.Items[j].DepartureTime
		}
		return response.Items[i].RiskScore > response.Items[j].RiskScore
	})

	response.Services = len(plans)
	response.Watched = len(response.Items)
	if len(response.Items) > 0 {
		response.HighestRisk = response.Items[0].RiskScore
	}
	if len(response.Items) > 10 {
		response.Items = response.Items[:10]
	}
	return response, nil
}

func (h *Handler) fetchTravelerSummaryForDate(ctx context.Context, date string) (*TravelerSummaryResponse, error) {
	args, _ := json.Marshal(map[string]string{"travelDate": date})
	result, err := h.mcp.CallTool(ctx, "get_traveler_summary", string(args))
	if err != nil {
		return nil, err
	}
	return parseTravelerSummaryText(result), nil
}

func leadTravelerClass(classes map[string]int) string {
	bestKey := ""
	bestValue := 0
	for key, value := range classes {
		if value > bestValue {
			bestKey = key
			bestValue = value
		}
	}
	return bestKey
}

func buildEurostarWatchPrompt(plan EuromapPlan, crewGap bool, load int) string {
	switch {
	case crewGap:
		return "Show me crew coverage for Eurostar service " + plan.ServiceCode + " today"
	case load >= 650:
		return "How is passenger load looking on Eurostar service " + plan.ServiceCode + " today?"
	default:
		return "Show me the latest stop-by-stop detail for Eurostar service " + plan.ServiceCode + " today"
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
