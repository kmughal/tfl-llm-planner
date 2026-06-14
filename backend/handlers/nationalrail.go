package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type NationalRailService struct {
	Hub         string `json:"hub"`
	Scheduled   string `json:"scheduled"`
	Expected    string `json:"expected"`
	Delay       int    `json:"delay"`
	Operator    string `json:"operator"`
	Destination string `json:"destination"`
	Platform    string `json:"platform"`
	Status      string `json:"status"`
	TrainID     string `json:"trainId"`
}

type NationalRailHub struct {
	Name      string `json:"name"`
	CRS       string `json:"crs"`
	Services  int    `json:"services"`
	Delayed   int    `json:"delayed"`
	Cancelled int    `json:"cancelled"`
	State     string `json:"state"`
}

type NationalRailAlert struct {
	Hub     string `json:"hub"`
	Message string `json:"message"`
}

type NationalRailCommandCenterResponse struct {
	Hubs        []NationalRailHub     `json:"hubs"`
	Services    []NationalRailService `json:"services"`
	Alerts      []NationalRailAlert   `json:"alerts"`
	FetchedAt   string                `json:"fetchedAt"`
	ToolSources []string              `json:"toolSources"`
}

func (h *Handler) GetNationalRailCommandCenter(c *gin.Context) {
	raw, err := h.mcp.CallTool(c.Request.Context(), "get_national_rail_dashboard", `{"count":6}`)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "National Rail live tools are unavailable", "detail": err.Error()})
		return
	}
	hubs, services, alerts := parseNationalRailDashboard(raw)
	if len(hubs) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "National Rail live dashboard returned no hubs"})
		return
	}
	c.JSON(http.StatusOK, NationalRailCommandCenterResponse{
		Hubs: hubs, Services: services, Alerts: alerts,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		ToolSources: []string{"get_national_rail_dashboard"},
	})
}

func parseNationalRailDashboard(raw string) ([]NationalRailHub, []NationalRailService, []NationalRailAlert) {
	var hubs []NationalRailHub
	var services []NationalRailService
	var alerts []NationalRailAlert
	for _, line := range strings.Split(raw, "\n") {
		switch {
		case strings.HasPrefix(line, "NRAIL_HUB:"):
			p := strings.Split(strings.TrimPrefix(line, "NRAIL_HUB:"), "|")
			if len(p) < 6 {
				continue
			}
			hubs = append(hubs, NationalRailHub{Name: p[0], CRS: p[1], Services: nrInt(p[2]), Delayed: nrInt(p[3]), Cancelled: nrInt(p[4]), State: p[5]})
		case strings.HasPrefix(line, "NRAIL_DASH_SERVICE:"):
			p := strings.Split(strings.TrimPrefix(line, "NRAIL_DASH_SERVICE:"), "|")
			if len(p) < 9 {
				continue
			}
			services = append(services, NationalRailService{Hub: p[0], Scheduled: p[1], Expected: p[2], Delay: nrInt(p[3]), Operator: p[4], Destination: p[5], Platform: p[6], Status: p[7], TrainID: p[8]})
		case strings.HasPrefix(line, "NRAIL_ALERT:"):
			p := strings.SplitN(strings.TrimPrefix(line, "NRAIL_ALERT:"), "|", 2)
			if len(p) == 2 {
				alerts = append(alerts, NationalRailAlert{Hub: p[0], Message: p[1]})
			}
		}
	}
	return hubs, services, alerts
}

func nrInt(value string) int {
	result, _ := strconv.Atoi(value)
	return result
}
