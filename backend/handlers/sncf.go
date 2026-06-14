package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type SNCFBoardService struct {
	Time      string `json:"time"`
	BaseTime  string `json:"baseTime"`
	Delay     int    `json:"delay"`
	Mode      string `json:"mode"`
	Number    string `json:"number"`
	Direction string `json:"direction"`
}

type SNCFStationBoard struct {
	Station  string             `json:"station"`
	Services []SNCFBoardService `json:"services"`
}

type SNCFIncident struct {
	Effect   string `json:"effect"`
	Severity string `json:"severity"`
	Impacted string `json:"impacted"`
	Message  string `json:"message"`
	Begin    string `json:"begin"`
	End      string `json:"end"`
}

type SNCFCommandCenterResponse struct {
	Boards      []SNCFStationBoard `json:"boards"`
	Incidents   []SNCFIncident     `json:"incidents"`
	FetchedAt   string             `json:"fetchedAt"`
	ToolSources []string           `json:"toolSources"`
	Errors      map[string]string  `json:"errors,omitempty"`
}

var sncfDashboardStations = []string{
	"Paris Montparnasse",
	"Lyon Part-Dieu",
	"Marseille Saint-Charles",
	"Bordeaux Saint-Jean",
}

// GetSNCFCommandCenter combines existing MCP tools into one live operating view.
func (h *Handler) GetSNCFCommandCenter(c *gin.Context) {
	ctx := c.Request.Context()
	errs := make(map[string]string)
	boards := make([]SNCFStationBoard, 0, len(sncfDashboardStations))

	for _, station := range sncfDashboardStations {
		args, _ := json.Marshal(map[string]any{"station": station, "count": 8})
		raw, err := h.mcp.CallTool(ctx, "get_sncf_departures", string(args))
		if err != nil {
			errs[station] = err.Error()
			continue
		}
		if board := parseSNCFDepartures(raw); board.Station != "" {
			boards = append(boards, board)
		}
	}

	disruptionsRaw, err := h.mcp.CallTool(context.WithoutCancel(ctx), "get_sncf_disruptions", `{}`)
	if err != nil {
		errs["disruptions"] = err.Error()
	}
	incidents := parseSNCFIncidents(disruptionsRaw)

	if len(boards) == 0 && len(incidents) == 0 && len(errs) > 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "SNCF MCP tools are unavailable", "sections": errs})
		return
	}

	c.JSON(http.StatusOK, SNCFCommandCenterResponse{
		Boards:      boards,
		Incidents:   incidents,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		ToolSources: []string{"get_sncf_departures", "get_sncf_disruptions"},
		Errors:      errs,
	})
}

func parseSNCFDepartures(raw string) SNCFStationBoard {
	board := SNCFStationBoard{}
	for _, line := range strings.Split(raw, "\n") {
		if strings.HasPrefix(line, "DEPARTURES_START:") {
			header := strings.Split(strings.TrimPrefix(line, "DEPARTURES_START:"), "|")
			if len(header) > 0 {
				board.Station = header[0]
			}
			continue
		}
		if !strings.HasPrefix(line, "DEP:") {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(line, "DEP:"), "|")
		if len(parts) < 6 {
			continue
		}
		delay, _ := strconv.Atoi(parts[2])
		board.Services = append(board.Services, SNCFBoardService{
			Time: parts[0], BaseTime: parts[1], Delay: delay,
			Mode: parts[3], Number: parts[4], Direction: parts[5],
		})
	}
	return board
}

func parseSNCFIncidents(raw string) []SNCFIncident {
	var incidents []SNCFIncident
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "DISRUPTION:") {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(line, "DISRUPTION:"), "|")
		if len(parts) < 6 {
			continue
		}
		incidents = append(incidents, SNCFIncident{
			Effect: parts[0], Severity: parts[1], Impacted: parts[2],
			Message: parts[3], Begin: parts[4], End: parts[5],
		})
	}
	return incidents
}
