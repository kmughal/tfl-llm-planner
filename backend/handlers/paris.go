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

type ParisTransitService struct {
	Time      string `json:"time"`
	BaseTime  string `json:"baseTime"`
	Delay     int    `json:"delay"`
	Mode      string `json:"mode"`
	Line      string `json:"line"`
	Direction string `json:"direction"`
	Color     string `json:"color"`
	TextColor string `json:"textColor"`
}

type ParisTransitBoard struct {
	Station  string                `json:"station"`
	Services []ParisTransitService `json:"services"`
}

type ParisTransitCommandCenterResponse struct {
	Boards      []ParisTransitBoard `json:"boards"`
	FetchedAt   string              `json:"fetchedAt"`
	ToolSources []string            `json:"toolSources"`
	Errors      map[string]string   `json:"errors,omitempty"`
}

var parisDashboardStations = []string{
	"Gare du Nord",
	"Chatelet",
	"Gare de Lyon",
	"Saint-Lazare",
	"Montparnasse",
}

func (h *Handler) GetParisCommandCenter(c *gin.Context) {
	ctx := c.Request.Context()
	errors := make(map[string]string)
	boards := make([]ParisTransitBoard, 0, len(parisDashboardStations))

	for _, station := range parisDashboardStations {
		args, _ := json.Marshal(map[string]any{"station": station, "count": 6})
		raw, err := h.mcp.CallTool(ctx, "get_paris_metro_departures", string(args))
		if err != nil {
			errors[station] = err.Error()
			continue
		}
		if board := parseParisTransitBoard(raw); board.Station != "" {
			boards = append(boards, board)
		}
	}

	if len(boards) == 0 && len(errors) > 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Paris RER MCP tools are unavailable", "sections": errors})
		return
	}

	c.JSON(http.StatusOK, ParisTransitCommandCenterResponse{
		Boards:      boards,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		ToolSources: []string{"get_paris_metro_departures"},
		Errors:      errors,
	})
}

func parseParisTransitBoard(raw string) ParisTransitBoard {
	board := ParisTransitBoard{}
	for _, line := range strings.Split(raw, "\n") {
		if strings.HasPrefix(line, "RATP_START:") {
			header := strings.Split(strings.TrimPrefix(line, "RATP_START:"), "|")
			if len(header) > 0 {
				board.Station = header[0]
			}
			continue
		}
		if !strings.HasPrefix(line, "DEP:") {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(line, "DEP:"), "|")
		if len(parts) < 8 {
			continue
		}
		delay, _ := strconv.Atoi(parts[2])
		board.Services = append(board.Services, ParisTransitService{
			Time:      parts[0],
			BaseTime:  parts[1],
			Delay:     delay,
			Mode:      parts[3],
			Line:      parts[4],
			Direction: parts[5],
			Color:     parts[6],
			TextColor: parts[7],
		})
	}
	return board
}

func callParisBoard(ctx context.Context, h *Handler, station string) (ParisTransitBoard, error) {
	args, _ := json.Marshal(map[string]any{"station": station, "count": 6})
	raw, err := h.mcp.CallTool(ctx, "get_paris_metro_departures", string(args))
	if err != nil {
		return ParisTransitBoard{}, err
	}
	return parseParisTransitBoard(raw), nil
}
