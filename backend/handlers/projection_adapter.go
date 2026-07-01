package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// projClient is a simple HTTP client for the local eurostar-projection read API.
// No auth required — it's a local service.

func projBaseURL() string {
	if u := os.Getenv("PROJECTION_BASE_URL"); u != "" {
		return u
	}
	return "http://localhost:8090"
}

var projHTTPClient = &http.Client{Timeout: 10 * time.Second}

func projGet(path string, out any) error {
	resp, err := projHTTPClient.Get(projBaseURL() + path)
	if err != nil {
		return fmt.Errorf("projection GET %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("projection %s: HTTP %d: %.200s", path, resp.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}

func projGetWithQuery(path string, params url.Values, out any) error {
	if len(params) > 0 {
		path += "?" + params.Encode()
	}
	return projGet(path, out)
}

// ── Projection API response types ─────────────────────────────────────────────
// JSON tags use PascalCase to match the projection API's response format.

type projCommercialService struct {
	ID                 string `json:"ID"`
	ServiceDate        string `json:"ServiceDate"`
	ServiceNumber      string `json:"ServiceNumber"`
	RouteType          string `json:"RouteType"`
	IsCancelled        bool   `json:"IsCancelled"`
	OriginCode         string `json:"OriginCode"`
	OriginName         string `json:"OriginName"`
	DestinationCode    string `json:"DestinationCode"`
	DestinationName    string `json:"DestinationName"`
	ScheduledDeparture string `json:"ScheduledDeparture"`
	ScheduledArrival   string `json:"ScheduledArrival"`
}

type projCommercialStop struct {
	Code          string `json:"Code"`
	Name          string `json:"Name"`
	ArrivalTime   string `json:"ArrivalTime"`
	DepartureTime string `json:"DepartureTime"`
	IsCancelled   bool   `json:"IsCancelled"`
	StopIndex     int    `json:"StopIndex"`
}

type projStop struct {
	Code              string `json:"Code"`
	Name              string `json:"Name"`
	PointType         string `json:"PointType"`
	ArrivalTime       string `json:"ArrivalTime"`
	PassingTime       string `json:"PassingTime"`
	DepartureTime     string `json:"DepartureTime"`
	ArrivalPlatform   string `json:"ArrivalPlatform"`
	DeparturePlatform string `json:"DeparturePlatform"`
	IsCancelled       bool   `json:"IsCancelled"`
	StopIndex         int    `json:"StopIndex"`
}

type projCrewLeg struct {
	ShiftID          string `json:"ShiftID"`
	ServiceNumber    string `json:"ServiceNumber"`
	OriginCode       string `json:"OriginCode"`
	DestinationCode  string `json:"DestinationCode"`
	CrewRole         string `json:"CrewRole"`
	PlannedDeparture string `json:"PlannedDeparture"`
	PlannedArrival   string `json:"PlannedArrival"`
}

type projServiceDetail struct {
	Service   projCommercialServiceFull `json:"service"`
	Stops     []projStop                `json:"stops"`
	Crew      []projCrewLeg             `json:"crew"`
	GPS       []projGPSEvent            `json:"gps"`
	Beacons   []projBeaconEvent         `json:"beacons"`
	Couplings []projCoupling            `json:"couplings"`
	Bookings  []projBooking             `json:"bookings"`
}

type projCommercialServiceFull struct {
	projCommercialService
	ServiceType    string `json:"ServiceType"`
	TrainSetNumber string `json:"TrainSetNumber"`
	EquipmentType  string `json:"EquipmentType"`
}

type projGPSEvent struct {
	StopCode     string `json:"StopCode"`
	EventType    string `json:"EventType"`
	ActualTime   string `json:"ActualTime"`
	IsCorrection bool   `json:"IsCorrection"`
}

type projBeaconEvent struct {
	PathwayID    string `json:"PathwayID"`
	ServiceDate  string `json:"ServiceDate"`
	StopCode     string `json:"StopCode"`
	EventType    string `json:"EventType"`
	ActualTime   string `json:"ActualTime"`
	IsCorrection bool   `json:"IsCorrection"`
}

type projCoupling struct {
	FromCode string `json:"FromCode"`
	ToCode   string `json:"ToCode"`
}

type projBooking struct {
	ID           string `json:"ID"`
	ServiceID    string `json:"ServiceID"`
	OriginCode   string `json:"OriginCode"`
	DestCode     string `json:"DestCode"`
	ServiceClass string `json:"ServiceClass"`
	Count        int    `json:"Count"`
}

type projNews struct {
	ID            string `json:"ID"`
	Department    string `json:"Department"`
	AuthorID      string `json:"AuthorID"`
	Category      string `json:"Category"`
	IsArchived    bool   `json:"IsArchived"`
	IsUnpublished bool   `json:"IsUnpublished"`
	PublishedAt   string `json:"PublishedAt"`
	UpdatedAt     string `json:"UpdatedAt"`
}

func projectionBookings(date string) ([]projBooking, error) {
	var resp struct {
		Bookings []projBooking `json:"bookings"`
	}
	params := url.Values{}
	params.Set("date", date)
	if err := projGetWithQuery("/bookings", params, &resp); err != nil {
		return nil, err
	}
	return resp.Bookings, nil
}

func projectionActiveNews(department, category string) ([]projNews, error) {
	var resp struct {
		News []projNews `json:"news"`
	}
	params := url.Values{}
	if department != "" {
		params.Set("department", department)
	}
	if category != "" {
		params.Set("category", category)
	}
	if err := projGetWithQuery("/news", params, &resp); err != nil {
		return nil, err
	}
	return resp.News, nil
}

func projectionBeacons(date string) ([]projBeaconEvent, error) {
	var resp struct {
		Beacons []projBeaconEvent `json:"beacons"`
	}
	params := url.Values{}
	params.Set("date", date)
	if err := projGetWithQuery("/beacons", params, &resp); err != nil {
		return nil, err
	}
	return resp.Beacons, nil
}

// ── Station helpers ───────────────────────────────────────────────────────────

// projUICShortCode maps UIC station codes (used by the projection API) to the
// 3-letter short codes used by the Euromap API and the frontend.
var projUICShortCode = map[string]string{
	"022726": "SPX", // St-Pancras-International
	"019649": "PNO", // Paris-Nord
	"000218": "BRU", // Bruxelles-Midi
	"022784": "AMS", // Amsterdam-Centraal
	"023316": "RTD", // Rotterdam-Centraal
	"018452": "MVC", // Marne-la-Vallée-Chessy
	"017946": "LIL", // Lille-Europe
	"007667": "KBF", // Köln Hbf
	"016176": "CLQ", // Eurotunnel Portail Sud (French side)
	"022725": "FTN", // Eurotunnel Portail Nord (UK side)
	"000320": "ESL", // Esplechin (passing point)
}

// projStationCountry maps known station codes to ISO country codes for the
// EuromapStation.Country field the frontend uses for flag display.
var projStationCountry = map[string]string{
	"SPX": "GB", "EBF": "GB", "ASI": "GB", "FTN": "GB",
	"LIL": "FR", "LEW": "FR", "CLQ": "FR", "PNO": "FR", "MVC": "FR",
	"BRU": "BE", "BXL": "BE", "LIE": "BE", "ESL": "BE",
	"ASD": "NL", "AMS": "NL", "RTD": "NL", "RDM": "NL",
	"KBF": "DE",
}

var projStationLatLon = map[string][2]string{
	"SPX": {"51.5314", "-0.1233"},
	"EBF": {"51.4417", "0.3199"},
	"ASI": {"51.1427", "0.8690"},
	"FTN": {"51.0930", "1.1380"},
	"CLQ": {"50.9261", "1.8467"},
	"LIL": {"50.6367", "3.0742"},
	"LEW": {"50.6367", "3.0742"},
	"PNO": {"48.8809", "2.3553"},
	"MVC": {"48.8576", "2.7792"},
	"BRU": {"50.8358", "4.3356"},
	"BXL": {"50.8358", "4.3356"},
	"LIE": {"50.6256", "5.5661"},
	"ESL": {"50.5656", "3.2850"},
	"ASD": {"52.3791", "4.8989"},
	"AMS": {"52.3791", "4.8989"},
	"RTD": {"51.9247", "4.4675"},
	"RDM": {"51.9247", "4.4675"},
	"KBF": {"50.9431", "6.9588"},
}

// resolveStation translates a UIC code (or existing short code) to (shortCode, country, lat, lon).
func resolveStation(code string) (shortCode, country, lat, lon string) {
	sc, ok := projUICShortCode[code]
	if !ok {
		sc = code
	}
	country = projStationCountry[sc]
	ll := projStationLatLon[sc]
	return sc, country, ll[0], ll[1]
}

func projSvcNum(id string) string {
	if i := strings.LastIndex(id, "_"); i >= 0 {
		return id[i+1:]
	}
	return id
}

func projPlanIDStr(date, svcNum string) string {
	return strings.ReplaceAll(date, "-", "") + "-" + svcNum
}

func projStatusStr(cancelled bool) string {
	if cancelled {
		return "deleted"
	}
	return "active"
}

func projStopType(idx, lastIdx int) string {
	switch {
	case idx == 0:
		return "origin"
	case idx == lastIdx:
		return "destination"
	default:
		return "passThrough"
	}
}

func projStopTimes(stop projCommercialStop, idx, lastIdx int) (departure, arrival string) {
	switch {
	case idx == 0:
		return stop.DepartureTime, ""
	case idx == lastIdx:
		return "", stop.ArrivalTime
	default:
		departure = stop.DepartureTime
		arrival = stop.ArrivalTime
		if departure == "" {
			departure = arrival
		}
		if arrival == "" {
			arrival = departure
		}
		return departure, arrival
	}
}

// projServiceDateToDate converts "2026-06-28T01:00:00+01:00" to "2026-06-28".
func projServiceDateToDate(serviceDate string) string {
	if len(serviceDate) >= 10 {
		return serviceDate[:10]
	}
	return serviceDate
}

func projectionCommercialStops(date, svcNum string) ([]projCommercialStop, error) {
	var resp struct {
		Stops []projCommercialStop `json:"stops"`
	}
	if err := projGet("/commercial/services/"+date+"/"+svcNum+"/stops", &resp); err != nil {
		return nil, err
	}
	return resp.Stops, nil
}

func projectionStopsAsStations(stops []projCommercialStop) []EuromapStation {
	if len(stops) == 0 {
		return nil
	}

	lastIdx := len(stops) - 1
	stations := make([]EuromapStation, 0, len(stops))
	for i, stop := range stops {
		shortCode, country, lat, lon := resolveStation(stop.Code)
		departure, arrival := projStopTimes(stop, i, lastIdx)
		stations = append(stations, EuromapStation{
			SequenceNumber:    i + 1,
			StopType:          projStopType(i, lastIdx),
			ShortCode:         shortCode,
			Country:           country,
			Latitude:          lat,
			Longitude:         lon,
			DepartureDatetime: departure,
			ArrivalDatetime:   arrival,
		})
	}
	return stations
}

func projectionFallbackStations(s projCommercialService) []EuromapStation {
	originCode, originCountry, originLat, originLon := resolveStation(s.OriginCode)
	destCode, destCountry, destLat, destLon := resolveStation(s.DestinationCode)
	return []EuromapStation{
		{
			SequenceNumber:    1,
			StopType:          "origin",
			ShortCode:         originCode,
			Country:           originCountry,
			Latitude:          originLat,
			Longitude:         originLon,
			DepartureDatetime: s.ScheduledDeparture,
		},
		{
			SequenceNumber:  2,
			StopType:        "destination",
			ShortCode:       destCode,
			Country:         destCountry,
			Latitude:        destLat,
			Longitude:       destLon,
			ArrivalDatetime: s.ScheduledArrival,
		},
	}
}

// ── Adapter: projection → []EuromapPlan ──────────────────────────────────────
// Used by GET /api/eurostar/trains

func projectionAsEuromapPlans(date string) ([]EuromapPlan, error) {
	var resp struct {
		Services []projCommercialService `json:"services"`
	}
	if err := projGet("/commercial/services?date="+date, &resp); err != nil {
		return nil, err
	}

	stopMap := make(map[string][]projCommercialStop, len(resp.Services))
	var stopMapMu sync.Mutex
	var firstErr error
	var firstErrMu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for _, svc := range resp.Services {
		svc := svc
		svcNum := svc.ServiceNumber
		if svcNum == "" {
			svcNum = projSvcNum(svc.ID)
		}
		if svcNum == "" {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			stops, err := projectionCommercialStops(date, svcNum)
			if err != nil {
				firstErrMu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				firstErrMu.Unlock()
				return
			}
			stopMapMu.Lock()
			stopMap[svcNum] = stops
			stopMapMu.Unlock()
		}()
	}
	wg.Wait()

	plans := make([]EuromapPlan, 0, len(resp.Services))
	for _, s := range resp.Services {
		svcNum := s.ServiceNumber
		if svcNum == "" {
			svcNum = projSvcNum(s.ID)
		}
		svcDate := projServiceDateToDate(s.ServiceDate)
		stations := projectionStopsAsStations(stopMap[svcNum])
		if len(stations) == 0 {
			stations = projectionFallbackStations(s)
		}

		plans = append(plans, EuromapPlan{
			Range:             "projection",
			Status:            projStatusStr(s.IsCancelled),
			PlanID:            projPlanIDStr(svcDate, svcNum),
			PlanType:          "commercial",
			ServiceCode:       svcNum,
			DepartureDatetime: s.ScheduledDeparture,
			ArrivalDatetime:   s.ScheduledArrival,
			Stations:          stations,
		})
	}
	if firstErr != nil && len(plans) == 0 {
		return nil, firstErr
	}
	return plans, nil
}

// ── Adapter: projection service detail → EuromapPlan (single) ────────────────
// Used by GET /api/eurostar/trains/:planID

func projectionAsEuromapPlan(date, svcNum string) (*EuromapPlan, error) {
	var detail projServiceDetail
	if err := projGet("/services/"+date+"/"+svcNum, &detail); err != nil {
		return nil, err
	}

	s := detail.Service.projCommercialService
	svcDate := projServiceDateToDate(s.ServiceDate)
	lastIdx := len(detail.Stops) - 1

	stations := make([]EuromapStation, 0, len(detail.Stops))
	for i, stop := range detail.Stops {
		shortCode, country, lat, lon := resolveStation(stop.Code)
		st := EuromapStation{
			SequenceNumber: i + 1,
			ShortCode:      shortCode,
			Country:        country,
			Latitude:       lat,
			Longitude:      lon,
		}

		switch {
		case i == 0:
			st.StopType = "origin"
			st.DepartureDatetime = stop.DepartureTime
		case i == lastIdx:
			st.StopType = "destination"
			st.ArrivalDatetime = stop.ArrivalTime
		default:
			st.StopType = "passThrough"
			t := stop.PassingTime
			if t == "" {
				t = stop.ArrivalTime
			}
			st.ArrivalDatetime = t
			if stop.DepartureTime != "" {
				st.DepartureDatetime = stop.DepartureTime
			}
		}
		stations = append(stations, st)
	}

	sn := s.ServiceNumber
	if sn == "" {
		sn = projSvcNum(s.ID)
	}
	plan := &EuromapPlan{
		Range:             "projection",
		Status:            projStatusStr(s.IsCancelled),
		PlanID:            projPlanIDStr(svcDate, sn),
		PlanType:          "commercial",
		ServiceCode:       sn,
		DepartureDatetime: s.ScheduledDeparture,
		ArrivalDatetime:   s.ScheduledArrival,
		Stations:          stations,
	}
	return plan, nil
}

// ── Adapter: projection → EurostarCatalogResponse ────────────────────────────
// Used by GET /api/eurostar/catalog

func projectionAsCatalog(date string) (EurostarCatalogResponse, error) {
	var resp struct {
		Services []projCommercialService `json:"services"`
	}
	if err := projGet("/commercial/services?date="+date, &resp); err != nil {
		return EurostarCatalogResponse{}, err
	}

	now := time.Now().UTC()
	items := make([]EurostarCatalogItem, 0, len(resp.Services))
	routes := map[string]struct{}{}
	for _, s := range resp.Services {
		svcNum := s.ServiceNumber
		if svcNum == "" {
			svcNum = projSvcNum(s.ID)
		}
		svcDate := projServiceDateToDate(s.ServiceDate)
		originCode, _, _, _ := resolveStation(s.OriginCode)
		destCode, _, _, _ := resolveStation(s.DestinationCode)

		originName := s.OriginName
		if originName == "" {
			originName = stationNameForCode(originCode)
		}
		destName := s.DestinationName
		if destName == "" {
			destName = stationNameForCode(destCode)
		}
		routeKey := originName + "|||" + destName
		routes[routeKey] = struct{}{}
		items = append(items, EurostarCatalogItem{
			PlanID:            projPlanIDStr(svcDate, svcNum),
			ServiceCode:       svcNum,
			Status:            projStatusStr(s.IsCancelled),
			DepartureDateTime: s.ScheduledDeparture,
			ArrivalDateTime:   s.ScheduledArrival,
			OriginCode:        originCode,
			OriginName:        originName,
			DestinationCode:   destCode,
			DestinationName:   destName,
			RouteKey:          routeKey,
		})
	}

	return EurostarCatalogResponse{
		Date:       date,
		Cached:     false,
		FetchedAt:  now.Format(time.RFC3339),
		Count:      len(items),
		Services:   items,
		RouteCount: len(routes),
	}, nil
}

// ── Adapter: projection service detail → []EnrichedCrew ──────────────────────
// Used by GET /api/crew/activities when crew is disabled but projection is on.
// Projection has crew legs (roles + shift IDs) but no personal details.

func projectionAsCrewActivities(date, serviceCode string) ([]EnrichedCrew, error) {
	var detail projServiceDetail
	if err := projGet("/services/"+date+"/"+serviceCode, &detail); err != nil {
		return nil, err
	}

	result := make([]EnrichedCrew, 0, len(detail.Crew))
	for _, leg := range detail.Crew {
		result = append(result, EnrichedCrew{
			CrewType:    leg.CrewRole,
			CrewID:      leg.ShiftID,
			ServiceCode: leg.ServiceNumber,
			Origin:      leg.OriginCode,
			Destination: leg.DestinationCode,
			Departure:   fmtSOTTime(leg.PlannedDeparture),
			Arrival:     fmtSOTTime(leg.PlannedArrival),
		})
	}
	return result, nil
}
