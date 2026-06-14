package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type TFLLineStatusDetail struct {
	StatusSeverity            int    `json:"statusSeverity"`
	StatusSeverityDescription string `json:"statusSeverityDescription"`
	Reason                    string `json:"reason,omitempty"`
}

type TFLLineStatus struct {
	ID           string                `json:"id"`
	Name         string                `json:"name"`
	ModeName     string                `json:"modeName"`
	LineStatuses []TFLLineStatusDetail `json:"lineStatuses"`
}

type TFLRoadStatus struct {
	ID                        string  `json:"id"`
	DisplayName               string  `json:"displayName"`
	StatusSeverity            string  `json:"statusSeverity"`
	StatusSeverityDescription string  `json:"statusSeverityDescription"`
	Lat                       float64 `json:"lat,omitempty"`
	Lon                       float64 `json:"lon,omitempty"`
}

type TFLMapLine struct {
	ID     string      `json:"id"`
	Name   string      `json:"name"`
	Branch int         `json:"branch"`
	Points [][]float64 `json:"points"`
}

type TFLMapStation struct {
	LineID string  `json:"lineId"`
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
}

type TFLBusLine struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type TFLCommandCenterResponse struct {
	Lines       []TFLLineStatus   `json:"lines"`
	Roads       []TFLRoadStatus   `json:"roads"`
	Buses       []TFLBusLine      `json:"buses"`
	MapLines    []TFLMapLine      `json:"mapLines"`
	MapStations []TFLMapStation   `json:"mapStations"`
	FetchedAt   string            `json:"fetchedAt"`
	ToolSources []string          `json:"toolSources"`
	Errors      map[string]string `json:"errors,omitempty"`
}

// GetTFLCommandCenter builds the dashboard exclusively from registered MCP tools.
func (h *Handler) GetTFLCommandCenter(c *gin.Context) {
	ctx := c.Request.Context()

	errors := make(map[string]string)
	statusRaw, statusErr := h.mcp.CallTool(ctx, "get_status_by_mode", `{"modes":"tube,dlr,overground,elizabeth-line"}`)
	if statusErr != nil {
		errors["lines"] = statusErr.Error()
	}
	roadsRaw, roadsErr := h.mcp.CallTool(ctx, "get_tfl_roads", `{}`)
	if roadsErr != nil {
		errors["roads"] = roadsErr.Error()
	}
	busesRaw, busesErr := h.mcp.CallTool(ctx, "get_all_bus_lines", `{}`)
	if busesErr != nil {
		errors["buses"] = busesErr.Error()
	}
	lines := parseTFLStatuses(statusRaw)

	if len(errors) >= 3 && len(lines) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "all TfL MCP tools are unavailable", "sections": errors})
		return
	}

	c.JSON(http.StatusOK, TFLCommandCenterResponse{
		Lines:       lines,
		Roads:       parseTFLRoads(roadsRaw),
		Buses:       parseTFLBusLines(busesRaw),
		MapLines:    []TFLMapLine{},
		MapStations: []TFLMapStation{},
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		ToolSources: []string{"get_status_by_mode", "get_tfl_roads", "get_all_bus_lines", "get_tfl_network_map"},
		Errors:      errors,
	})
}

func parseTFLStatuses(raw string) []TFLLineStatus {
	var out []TFLLineStatus
	byID := make(map[string]int)
	for _, sourceLine := range strings.Split(raw, "\n") {
		line := strings.TrimSpace(strings.TrimLeft(sourceLine, "✓⚠✗×•-–— "))
		colon := strings.Index(line, ":")
		lowerLine := strings.ToLower(line)
		if colon < 1 || strings.HasPrefix(lowerLine, "tfl status") || strings.HasPrefix(lowerLine, "hint:") {
			continue
		}

		name := strings.TrimSpace(line[:colon])
		rest := strings.TrimSpace(line[colon+1:])
		if name == "" || rest == "" || len(name) > 40 || strings.Contains(strings.ToLower(name), "api error") {
			continue
		}

		status, reason := rest, ""
		if idx := strings.Index(rest, " — "); idx >= 0 {
			status, reason = strings.TrimSpace(rest[:idx]), strings.TrimSpace(rest[idx+len(" — "):])
		}
		severity := 10
		lower := strings.ToLower(status)
		if !strings.Contains(lower, "good") {
			severity = 5
		}

		id := tflLineID(name)
		parsed := TFLLineStatus{
			ID:       id,
			Name:     name,
			ModeName: tflModeName(id),
			LineStatuses: []TFLLineStatusDetail{{
				StatusSeverity:            severity,
				StatusSeverityDescription: status,
				Reason:                    reason,
			}},
		}
		if index, exists := byID[id]; exists {
			if severity < out[index].LineStatuses[0].StatusSeverity {
				out[index] = parsed
			}
			continue
		}
		byID[id] = len(out)
		out = append(out, parsed)
	}
	return out
}

func parseTFLRoads(raw string) []TFLRoadStatus {
	var out []TFLRoadStatus
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "ROAD:") {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(line, "ROAD:"), "|")
		if len(parts) < 4 {
			continue
		}
		road := TFLRoadStatus{
			ID:                        parts[0],
			DisplayName:               parts[1],
			StatusSeverity:            parts[2],
			StatusSeverityDescription: parts[3],
		}
		if len(parts) >= 6 {
			road.Lat, _ = strconv.ParseFloat(parts[4], 64)
			road.Lon, _ = strconv.ParseFloat(parts[5], 64)
		}
		out = append(out, road)
	}
	return out
}

func parseTFLMap(raw string) ([]TFLMapLine, []TFLMapStation) {
	var lines []TFLMapLine
	var stations []TFLMapStation
	for _, row := range strings.Split(raw, "\n") {
		if strings.HasPrefix(row, "MAP_LINE:") {
			parts := strings.SplitN(strings.TrimPrefix(row, "MAP_LINE:"), "|", 4)
			if len(parts) != 4 {
				continue
			}
			branch, _ := strconv.Atoi(parts[2])
			line := TFLMapLine{ID: parts[0], Name: parts[1], Branch: branch}
			for _, pair := range strings.Split(parts[3], ";") {
				coords := strings.SplitN(pair, ",", 2)
				if len(coords) != 2 {
					continue
				}
				lat, latErr := strconv.ParseFloat(coords[0], 64)
				lon, lonErr := strconv.ParseFloat(coords[1], 64)
				if latErr == nil && lonErr == nil {
					line.Points = append(line.Points, []float64{lat, lon})
				}
			}
			if len(line.Points) > 1 {
				lines = append(lines, line)
			}
		}
		if strings.HasPrefix(row, "MAP_STATION:") {
			parts := strings.SplitN(strings.TrimPrefix(row, "MAP_STATION:"), "|", 5)
			if len(parts) != 5 {
				continue
			}
			lat, latErr := strconv.ParseFloat(parts[3], 64)
			lon, lonErr := strconv.ParseFloat(parts[4], 64)
			if latErr == nil && lonErr == nil {
				stations = append(stations, TFLMapStation{LineID: parts[0], ID: parts[1], Name: parts[2], Lat: lat, Lon: lon})
			}
		}
	}
	return lines, stations
}

func parseTFLBusLines(raw string) []TFLBusLine {
	var out []TFLBusLine
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "BUS_LINE:") {
			continue
		}
		parts := strings.SplitN(strings.TrimPrefix(line, "BUS_LINE:"), "|", 2)
		if len(parts) != 2 {
			continue
		}
		out = append(out, TFLBusLine{ID: parts[0], Name: parts[1]})
	}
	return out
}

func tflLineID(name string) string {
	aliases := map[string]string{
		"Hammersmith & City": "hammersmith-city",
		"London Overground":  "london-overground",
		"Waterloo & City":    "waterloo-city",
		"Elizabeth line":     "elizabeth",
		"DLR":                "dlr",
	}
	if id := aliases[name]; id != "" {
		return id
	}
	id := strings.ToLower(name)
	id = strings.NewReplacer(" & ", "-", " ", "-", "/", "-").Replace(id)
	return id
}

func tflModeName(id string) string {
	switch id {
	case "dlr":
		return "dlr"
	case "london-overground", "liberty", "lioness", "mildmay", "suffragette", "weaver", "windrush":
		return "overground"
	case "elizabeth":
		return "elizabeth-line"
	case "tram":
		return "tram"
	default:
		return "tube"
	}
}
