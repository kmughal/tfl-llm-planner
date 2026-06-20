package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type TFLCrowdingSample struct {
	TimeBand             string  `json:"timeBand"`
	PercentageOfBaseline float64 `json:"percentageOfBaseline"`
}

type TFLLineCrowdingStop struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	CurrentTimeBand string              `json:"currentTimeBand"`
	CurrentLevel    float64             `json:"currentLevel"`
	PeakLevel       float64             `json:"peakLevel"`
	AMPeakTimeBand  string              `json:"amPeakTimeBand"`
	PMPeakTimeBand  string              `json:"pmPeakTimeBand"`
	Samples         []TFLCrowdingSample `json:"samples"`
}

type TFLLineCrowdingResponse struct {
	LineID      string                `json:"lineId"`
	LineName    string                `json:"lineName"`
	DayOfWeek   string                `json:"dayOfWeek"`
	FetchedAt   string                `json:"fetchedAt"`
	Stops       []TFLLineCrowdingStop `json:"stops"`
	StopCount   int                   `json:"stopCount"`
	Coverage    int                   `json:"coverage"`
	Missing     int                   `json:"missing"`
	CurrentBand string                `json:"currentBand"`
}

type tflStopPoint struct {
	ID         string `json:"id"`
	CommonName string `json:"commonName"`
}

type tflCrowdingPayload struct {
	Naptan         string `json:"naptan"`
	DayOfWeek      string `json:"dayOfWeek"`
	AMPeakTimeBand string `json:"amPeakTimeBand"`
	PMPeakTimeBand string `json:"pmPeakTimeBand"`
	TimeBands      []struct {
		TimeBand             string  `json:"timeBand"`
		PercentageOfBaseline float64 `json:"percentageOfBaseLine"`
	} `json:"timeBands"`
}

func (h *Handler) GetTFLLineCrowding(c *gin.Context) {
	if !IsServiceEnabled("tfl") {
		serviceDisabledJSON(c, "tfl")
		return
	}
	lineID := strings.TrimSpace(c.Param("lineID"))
	if lineID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lineID required"})
		return
	}

	day := normalizeCrowdingDay(c.Query("day"))
	if day == "" {
		day = londonCrowdingDay(time.Now())
	}
	cacheKey := "tfl/crowding/" + lineID + "/" + day

	lineName := c.Query("lineName")
	if lineName == "" {
		lineName = strings.Title(strings.ReplaceAll(lineID, "-", " "))
	}

	stopsBody, err := tflGet("/Line/"+url.PathEscape(lineID)+"/StopPoints", url.Values{})
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, fmt.Sprintf("stop points unavailable: %v", err)) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("stop points unavailable: %v", err)})
		return
	}

	var rawStops []tflStopPoint
	if err := json.Unmarshal(stopsBody, &rawStops); err != nil {
		if respondWithCachedSnapshot(c, cacheKey, "failed to decode TfL stop points") {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to decode TfL stop points"})
		return
	}

	stops := dedupeCrowdingStops(rawStops)
	if len(stops) == 0 {
		c.JSON(http.StatusOK, TFLLineCrowdingResponse{
			LineID:    lineID,
			LineName:  lineName,
			DayOfWeek: day,
			FetchedAt: time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	currentBand := currentQuarterBandLondon(time.Now())
	outStops := make([]TFLLineCrowdingStop, 0, len(stops))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for _, stop := range stops {
		stop := stop
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			body, err := tflGet("/crowding/"+url.PathEscape(stop.ID)+"/"+day, url.Values{})
			if err != nil {
				return
			}

			var payload tflCrowdingPayload
			if err := json.Unmarshal(body, &payload); err != nil || len(payload.TimeBands) == 0 {
				return
			}

			samples := make([]TFLCrowdingSample, 0, len(payload.TimeBands))
			currentLevel := 0.0
			peakLevel := 0.0
			for _, band := range payload.TimeBands {
				level := band.PercentageOfBaseline * 100
				samples = append(samples, TFLCrowdingSample{
					TimeBand:             band.TimeBand,
					PercentageOfBaseline: level,
				})
				if level > peakLevel {
					peakLevel = level
				}
				if band.TimeBand == currentBand {
					currentLevel = level
				}
			}

			mu.Lock()
			outStops = append(outStops, TFLLineCrowdingStop{
				ID:              stop.ID,
				Name:            compactStationName(stop.CommonName),
				CurrentTimeBand: currentBand,
				CurrentLevel:    currentLevel,
				PeakLevel:       peakLevel,
				AMPeakTimeBand:  payload.AMPeakTimeBand,
				PMPeakTimeBand:  payload.PMPeakTimeBand,
				Samples:         samples,
			})
			mu.Unlock()
		}()
	}

	wg.Wait()

	sort.Slice(outStops, func(i, j int) bool {
		if outStops[i].CurrentLevel == outStops[j].CurrentLevel {
			return outStops[i].Name < outStops[j].Name
		}
		return outStops[i].CurrentLevel > outStops[j].CurrentLevel
	})

	respondJSONAndCache(c, cacheKey, http.StatusOK, TFLLineCrowdingResponse{
		LineID:      lineID,
		LineName:    lineName,
		DayOfWeek:   day,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		Stops:       outStops,
		StopCount:   len(stops),
		Coverage:    len(outStops),
		Missing:     len(stops) - len(outStops),
		CurrentBand: currentBand,
	})
}

func dedupeCrowdingStops(raw []tflStopPoint) []tflStopPoint {
	seen := make(map[string]bool, len(raw))
	out := make([]tflStopPoint, 0, len(raw))
	for _, stop := range raw {
		if stop.ID == "" || stop.CommonName == "" || seen[stop.ID] {
			continue
		}
		seen[stop.ID] = true
		out = append(out, stop)
	}
	return out
}

func compactStationName(name string) string {
	name = strings.ReplaceAll(name, " Underground Station", "")
	name = strings.ReplaceAll(name, " Rail Station", "")
	name = strings.ReplaceAll(name, " DLR Station", "")
	name = strings.ReplaceAll(name, " Elizabeth line Station", "")
	name = strings.TrimSpace(name)
	return name
}

func normalizeCrowdingDay(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "mon", "monday":
		return "Mon"
	case "tue", "tues", "tuesday":
		return "Tue"
	case "wed", "wednesday":
		return "Wed"
	case "thu", "thurs", "thursday":
		return "Thu"
	case "fri", "friday":
		return "Fri"
	case "sat", "saturday":
		return "Sat"
	case "sun", "sunday":
		return "Sun"
	default:
		return ""
	}
}

func londonCrowdingDay(now time.Time) string {
	loc, err := time.LoadLocation("Europe/London")
	if err != nil {
		loc = time.UTC
	}
	switch now.In(loc).Weekday() {
	case time.Monday:
		return "Mon"
	case time.Tuesday:
		return "Tue"
	case time.Wednesday:
		return "Wed"
	case time.Thursday:
		return "Thu"
	case time.Friday:
		return "Fri"
	case time.Saturday:
		return "Sat"
	default:
		return "Sun"
	}
}

func currentQuarterBandLondon(now time.Time) string {
	loc, err := time.LoadLocation("Europe/London")
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	minute := (local.Minute() / 15) * 15
	start := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), minute, 0, 0, loc)
	end := start.Add(15 * time.Minute)
	return fmt.Sprintf("%02d:%02d-%02d:%02d", start.Hour(), start.Minute(), end.Hour()%24, end.Minute())
}
