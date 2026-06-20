package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var busHTTP = &http.Client{Timeout: 15 * time.Second}

const tflBase = "https://api.tfl.gov.uk"
const countdownBase = "https://countdown.api.tfl.gov.uk/interfaces/ura/instant_V1"

type BusLine struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	RouteSection string `json:"routeSection,omitempty"` // e.g. "Tottenham Court Road to Canada Water"
	ServiceType  string `json:"serviceType,omitempty"`  // "Regular", "Night", "Express"
}

type BusArrivalEntry struct {
	StopName string `json:"stopName"`
	LineName string `json:"lineName"`
	EtaMs    int64  `json:"etaMs"`
}

type BusLineArrivals struct {
	LineID       string            `json:"lineID"`
	ServerTimeMs int64             `json:"serverTimeMs"`
	Arrivals     []BusArrivalEntry `json:"arrivals"`
}

func tflGet(path string, params url.Values) ([]byte, error) {
	if key := os.Getenv("TFL_APP_KEY"); key != "" {
		params.Set("app_key", key)
	}
	u := fmt.Sprintf("%s%s?%s", tflBase, path, params.Encode())
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; tfl-llm-sample/1.0)")
	resp, err := busHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TfL returned %d", resp.StatusCode)
	}
	return body, nil
}

// GetBusLines returns all London bus routes sorted numerically then alphabetically.
func GetBusLines(c *gin.Context) {
	if !IsServiceEnabled("tfl") {
		serviceDisabledJSON(c, "tfl")
		return
	}
	cacheKey := "tfl/bus-lines"
	body, err := tflGet("/Line/Mode/bus", url.Values{})
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var raw []struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		RouteSections []struct {
			Name string `json:"name"`
		} `json:"routeSections"`
		ServiceTypes []struct {
			Name string `json:"name"`
		} `json:"serviceTypes"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		if respondWithCachedSnapshot(c, cacheKey, "decode failed") {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "decode failed"})
		return
	}

	lines := make([]BusLine, 0, len(raw))
	for _, l := range raw {
		line := BusLine{ID: l.ID, Name: l.Name}
		if len(l.RouteSections) > 0 {
			line.RouteSection = l.RouteSections[0].Name
		}
		if len(l.ServiceTypes) > 0 {
			line.ServiceType = l.ServiceTypes[0].Name
		}
		lines = append(lines, line)
	}

	sort.Slice(lines, func(i, j int) bool {
		ni, errI := strconv.Atoi(lines[i].ID)
		nj, errJ := strconv.Atoi(lines[j].ID)
		if errI == nil && errJ == nil {
			return ni < nj
		}
		if errI == nil {
			return true
		}
		if errJ == nil {
			return false
		}
		return lines[i].ID < lines[j].ID
	})

	respondJSONAndCache(c, cacheKey, http.StatusOK, lines)
}

// GetBusLineArrivals fetches live arrivals for a bus route via the TfL Countdown URA API.
func GetBusLineArrivals(c *gin.Context) {
	if !IsServiceEnabled("tfl") {
		serviceDisabledJSON(c, "tfl")
		return
	}
	lineID := c.Param("lineID")
	if lineID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lineID required"})
		return
	}
	cacheKey := "tfl/bus-arrivals/" + lineID

	u := fmt.Sprintf("%s?LineName=%s&ReturnList=StopPointName,LineName,EstimatedTime",
		countdownBase, url.QueryEscape(lineID))

	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; tfl-llm-sample/1.0)")

	resp, err := busHTTP.Do(req)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, "read body failed") {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "read body failed"})
		return
	}
	if resp.StatusCode != http.StatusOK {
		if respondWithCachedSnapshot(c, cacheKey, fmt.Sprintf("countdown returned %d", resp.StatusCode)) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("countdown returned %d", resp.StatusCode)})
		return
	}

	result := BusLineArrivals{LineID: lineID}

	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var record []json.RawMessage
		if err := json.Unmarshal([]byte(line), &record); err != nil || len(record) < 1 {
			continue
		}
		var recType int
		if err := json.Unmarshal(record[0], &recType); err != nil {
			continue
		}
		switch recType {
		case 4:
			if len(record) >= 3 {
				json.Unmarshal(record[2], &result.ServerTimeMs) //nolint:errcheck
			}
		case 1:
			if len(record) >= 4 {
				var stopN, lineN string
				var etaMs int64
				json.Unmarshal(record[1], &stopN) //nolint:errcheck
				json.Unmarshal(record[2], &lineN) //nolint:errcheck
				json.Unmarshal(record[3], &etaMs) //nolint:errcheck
				result.Arrivals = append(result.Arrivals, BusArrivalEntry{
					StopName: stopN,
					LineName: lineN,
					EtaMs:    etaMs,
				})
			}
		}
	}

	sort.Slice(result.Arrivals, func(i, j int) bool {
		return result.Arrivals[i].EtaMs < result.Arrivals[j].EtaMs
	})
	if len(result.Arrivals) > 40 {
		result.Arrivals = result.Arrivals[:40]
	}

	respondJSONAndCache(c, cacheKey, http.StatusOK, result)
}
