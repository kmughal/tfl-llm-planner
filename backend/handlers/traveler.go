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

type TravelerServiceSummary struct {
	ServiceCode string         `json:"serviceCode"`
	TotalCount  int            `json:"totalCount"`
	Origin      string         `json:"origin"`
	Destination string         `json:"destination"`
	Classes     map[string]int `json:"classes"`
	Types       map[string]int `json:"types"`
}

type TravelerSummaryResponse struct {
	Date            string                   `json:"date"`
	Services        int                      `json:"services"`
	TotalPassengers int                      `json:"totalPassengers"`
	BusiestService  string                   `json:"busiestService"`
	PeakLoad        int                      `json:"peakLoad"`
	Items           []TravelerServiceSummary `json:"items"`
}

func parseTravelerSummaryText(raw string) *TravelerSummaryResponse {
	lines := strings.Split(raw, "\n")
	start := -1
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "TRAVELER_SUMMARY_START:") {
			start = i
			break
		}
	}
	if start < 0 {
		return nil
	}

	header := strings.TrimPrefix(strings.TrimSpace(lines[start]), "TRAVELER_SUMMARY_START:")
	parts := strings.Split(header, "|")
	out := &TravelerSummaryResponse{
		Date:  strings.TrimSpace(firstPart(parts, 0)),
		Items: make([]TravelerServiceSummary, 0, 16),
	}
	if len(parts) > 1 {
		out.Services, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	}

	var current *TravelerServiceSummary
	for i := start + 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		switch {
		case strings.HasPrefix(line, "SERVICE_START:"):
			p := strings.Split(strings.TrimPrefix(line, "SERVICE_START:"), "|")
			total, _ := strconv.Atoi(strings.TrimSpace(firstPart(p, 1)))
			current = &TravelerServiceSummary{
				ServiceCode: strings.TrimSpace(firstPart(p, 0)),
				TotalCount:  total,
				Origin:      strings.TrimSpace(firstPart(p, 2)),
				Destination: strings.TrimSpace(firstPart(p, 3)),
				Classes:     map[string]int{},
				Types:       map[string]int{},
			}
		case line == "SERVICE_END":
			if current != nil {
				out.Items = append(out.Items, *current)
				out.TotalPassengers += current.TotalCount
				if current.TotalCount > out.PeakLoad {
					out.PeakLoad = current.TotalCount
					out.BusiestService = current.ServiceCode
				}
			}
			current = nil
		case strings.HasPrefix(line, "CLASS:") && current != nil:
			p := strings.Split(strings.TrimPrefix(line, "CLASS:"), "|")
			count, _ := strconv.Atoi(strings.TrimSpace(firstPart(p, 1)))
			current.Classes[strings.TrimSpace(firstPart(p, 0))] = count
		case strings.HasPrefix(line, "TYPE:") && current != nil:
			p := strings.Split(strings.TrimPrefix(line, "TYPE:"), "|")
			count, _ := strconv.Atoi(strings.TrimSpace(firstPart(p, 1)))
			current.Types[strings.TrimSpace(firstPart(p, 0))] = count
		case line == "TRAVELER_SUMMARY_END":
			if out.Services == 0 {
				out.Services = len(out.Items)
			}
			return out
		}
	}

	if out.Services == 0 {
		out.Services = len(out.Items)
	}
	if len(out.Items) == 0 {
		return nil
	}
	return out
}

func firstPart(parts []string, idx int) string {
	if idx < 0 || idx >= len(parts) {
		return ""
	}
	return parts[idx]
}

func (h *Handler) GetEurostarTravelerSummary(c *gin.Context) {
	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		date = time.Now().UTC().Format(dateFmt)
	}
	if _, err := time.Parse(dateFmt, date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date, use YYYY-MM-DD"})
		return
	}

	args, _ := json.Marshal(map[string]string{"travelDate": date})
	result, err := h.mcp.CallTool(context.Background(), "get_traveler_summary", string(args))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	summary := parseTravelerSummaryText(result)
	if summary == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "traveler summary unavailable"})
		return
	}
	c.JSON(http.StatusOK, summary)
}
