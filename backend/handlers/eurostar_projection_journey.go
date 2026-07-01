package handlers

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

type ProjectionJourneySummary struct {
	ServiceNumber      string `json:"serviceNumber"`
	ServiceDate        string `json:"serviceDate"`
	Status             string `json:"status"`
	RouteType          string `json:"routeType"`
	TrainSetNumber     string `json:"trainSetNumber"`
	EquipmentType      string `json:"equipmentType"`
	OriginCode         string `json:"originCode"`
	OriginName         string `json:"originName"`
	DestinationCode    string `json:"destinationCode"`
	DestinationName    string `json:"destinationName"`
	ScheduledDeparture string `json:"scheduledDeparture"`
	ScheduledArrival   string `json:"scheduledArrival"`
}

type ProjectionJourneyStop struct {
	Index             int    `json:"index"`
	Code              string `json:"code"`
	ShortCode         string `json:"shortCode"`
	Name              string `json:"name"`
	PointType         string `json:"pointType"`
	Country           string `json:"country"`
	Latitude          string `json:"latitude,omitempty"`
	Longitude         string `json:"longitude,omitempty"`
	ArrivalTime       string `json:"arrivalTime,omitempty"`
	DepartureTime     string `json:"departureTime,omitempty"`
	PassingTime       string `json:"passingTime,omitempty"`
	ArrivalPlatform   string `json:"arrivalPlatform,omitempty"`
	DeparturePlatform string `json:"departurePlatform,omitempty"`
	IsCancelled       bool   `json:"isCancelled"`
}

type ProjectionJourneyEvent struct {
	StopCode     string `json:"stopCode"`
	ShortCode    string `json:"shortCode"`
	StopName     string `json:"stopName"`
	EventType    string `json:"eventType"`
	ActualTime   string `json:"actualTime"`
	IsCorrection bool   `json:"isCorrection"`
	Source       string `json:"source"`
}

type ProjectionJourneyBooking struct {
	OriginCode   string `json:"originCode"`
	OriginShort  string `json:"originShort"`
	DestCode     string `json:"destCode"`
	DestShort    string `json:"destShort"`
	ServiceClass string `json:"serviceClass"`
	Count        int    `json:"count"`
}

type ProjectionJourneyCoupling struct {
	FromCode  string `json:"fromCode"`
	FromShort string `json:"fromShort"`
	ToCode    string `json:"toCode"`
	ToShort   string `json:"toShort"`
}

type ProjectionJourneyNewsItem struct {
	ID          string `json:"id"`
	Department  string `json:"department"`
	Category    string `json:"category"`
	PublishedAt string `json:"publishedAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type ProjectionBeaconSummary struct {
	Count         int                    `json:"count"`
	PathwayCount  int                    `json:"pathwayCount"`
	Latest        *ProjectionJourneyEvent `json:"latest,omitempty"`
}

type ProjectionBookingClassTotal struct {
	ServiceClass string `json:"serviceClass"`
	Count        int    `json:"count"`
}

type ProjectionBookingFlow struct {
	OriginCode   string `json:"originCode"`
	OriginShort  string `json:"originShort"`
	DestCode     string `json:"destCode"`
	DestShort    string `json:"destShort"`
	ServiceClass string `json:"serviceClass"`
	Count        int    `json:"count"`
}

type ProjectionJourneyDetailResponse struct {
	ProjectionEnabled bool                        `json:"projectionEnabled"`
	Date              string                      `json:"date"`
	Service           ProjectionJourneySummary    `json:"service"`
	Stops             []ProjectionJourneyStop     `json:"stops"`
	Beacons           []ProjectionJourneyEvent    `json:"beacons"`
	GPS               []ProjectionJourneyEvent    `json:"gps"`
	Bookings          []ProjectionJourneyBooking  `json:"bookings"`
	Couplings         []ProjectionJourneyCoupling `json:"couplings"`
	News              []ProjectionJourneyNewsItem `json:"news,omitempty"`
}

func projectionJourneyEnabled(c *gin.Context) bool {
	if !IsServiceEnabled("eurostar-projection") {
		serviceDisabledJSON(c, "eurostar-projection")
		return false
	}
	return true
}

func GetProjectionJourneyServices(c *gin.Context) {
	if !projectionJourneyEnabled(c) {
		return
	}

	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is required in YYYY-MM-DD format"})
		return
	}

	services, err := projectionJourneySummaries(date)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	sort.Slice(services, func(i, j int) bool {
		if services[i].ScheduledDeparture == services[j].ScheduledDeparture {
			return services[i].ServiceNumber < services[j].ServiceNumber
		}
		return services[i].ScheduledDeparture < services[j].ScheduledDeparture
	})

	c.JSON(http.StatusOK, gin.H{
		"projectionEnabled": true,
		"date":              date,
		"count":             len(services),
		"services":          services,
	})
}

func GetProjectionBookings(c *gin.Context) {
	if !projectionJourneyEnabled(c) {
		return
	}

	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is required in YYYY-MM-DD format"})
		return
	}

	bookings, err := projectionBookings(date)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"projectionEnabled": true,
		"date":              date,
		"count":             len(bookings),
		"totalBookings":     projectionBookingTotal(bookings),
		"classTotals":       projectionBookingClassTotals(bookings),
		"topFlows":          projectionBookingFlows(bookings),
	})
}

func GetProjectionNews(c *gin.Context) {
	if !projectionJourneyEnabled(c) {
		return
	}

	department := strings.TrimSpace(c.Query("department"))
	category := strings.TrimSpace(c.Query("category"))
	news, err := projectionActiveNews(department, category)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"projectionEnabled": true,
		"department":        department,
		"category":          category,
		"count":             len(news),
		"items":             projectionJourneyNews(news),
	})
}

func GetProjectionBeacons(c *gin.Context) {
	if !projectionJourneyEnabled(c) {
		return
	}

	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is required in YYYY-MM-DD format"})
		return
	}

	beacons, err := projectionBeacons(date)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	items := projectionJourneyEvents(beacons, map[string]string{}, "beacon")
	pathways := make(map[string]struct{})
	for _, beacon := range beacons {
		if beacon.PathwayID != "" {
			pathways[beacon.PathwayID] = struct{}{}
		}
	}
	var latest *ProjectionJourneyEvent
	if len(items) > 0 {
		last := items[len(items)-1]
		latest = &last
	}

	c.JSON(http.StatusOK, gin.H{
		"projectionEnabled": true,
		"date":              date,
		"beacons": ProjectionBeaconSummary{
			Count:        len(items),
			PathwayCount: len(pathways),
			Latest:       latest,
		},
	})
}

func projectionJourneySummaries(date string) ([]ProjectionJourneySummary, error) {
	var opsResp struct {
		Services []projCommercialServiceFull `json:"services"`
	}
	if err := projGet("/services?date="+date, &opsResp); err == nil {
		services := make([]ProjectionJourneySummary, 0, len(opsResp.Services))
		for _, service := range opsResp.Services {
			services = append(services, ProjectionJourneySummary{
				ServiceNumber:      service.ServiceNumber,
				ServiceDate:        projServiceDateToDate(service.ServiceDate),
				Status:             projStatusStr(service.IsCancelled),
				RouteType:          service.RouteType,
				TrainSetNumber:     service.TrainSetNumber,
				EquipmentType:      service.EquipmentType,
				OriginCode:         projectionShortCode(service.OriginCode),
				OriginName:         service.OriginName,
				DestinationCode:    projectionShortCode(service.DestinationCode),
				DestinationName:    service.DestinationName,
				ScheduledDeparture: service.ScheduledDeparture,
				ScheduledArrival:   service.ScheduledArrival,
			})
		}
		return services, nil
	}

	var commercialResp struct {
		Services []projCommercialService `json:"services"`
	}
	if err := projGet("/commercial/services?date="+date, &commercialResp); err != nil {
		return nil, err
	}

	services := make([]ProjectionJourneySummary, 0, len(commercialResp.Services))
	for _, service := range commercialResp.Services {
		services = append(services, ProjectionJourneySummary{
			ServiceNumber:      service.ServiceNumber,
			ServiceDate:        projServiceDateToDate(service.ServiceDate),
			Status:             projStatusStr(service.IsCancelled),
			RouteType:          service.RouteType,
			TrainSetNumber:     "",
			EquipmentType:      "",
			OriginCode:         projectionShortCode(service.OriginCode),
			OriginName:         service.OriginName,
			DestinationCode:    projectionShortCode(service.DestinationCode),
			DestinationName:    service.DestinationName,
			ScheduledDeparture: service.ScheduledDeparture,
			ScheduledArrival:   service.ScheduledArrival,
		})
	}
	return services, nil
}

func GetProjectionJourneyDetail(c *gin.Context) {
	if !projectionJourneyEnabled(c) {
		return
	}

	date := strings.TrimSpace(c.Param("date"))
	serviceNumber := strings.TrimSpace(c.Param("serviceNumber"))
	if date == "" || serviceNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date and serviceNumber are required"})
		return
	}

	var detail projServiceDetail
	if err := projGet("/services/"+date+"/"+serviceNumber, &detail); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	bookings := detail.Bookings
	if len(bookings) == 0 {
		if dailyBookings, err := projectionBookings(date); err == nil {
			bookings = filterProjectionBookingsForService(dailyBookings, detail.Service.ID)
		}
	}

	news, _ := projectionActiveNews("", "")

	stops := make([]ProjectionJourneyStop, 0, len(detail.Stops))
	stopNames := make(map[string]string, len(detail.Stops))
	for _, stop := range detail.Stops {
		shortCode, country, lat, lon := resolveStation(stop.Code)
		stopNames[stop.Code] = stop.Name
		stops = append(stops, ProjectionJourneyStop{
			Index:             stop.StopIndex,
			Code:              stop.Code,
			ShortCode:         shortCode,
			Name:              stop.Name,
			PointType:         stop.PointType,
			Country:           country,
			Latitude:          lat,
			Longitude:         lon,
			ArrivalTime:       stop.ArrivalTime,
			DepartureTime:     stop.DepartureTime,
			PassingTime:       stop.PassingTime,
			ArrivalPlatform:   stop.ArrivalPlatform,
			DeparturePlatform: stop.DeparturePlatform,
			IsCancelled:       stop.IsCancelled,
		})
	}
	sort.Slice(stops, func(i, j int) bool { return stops[i].Index < stops[j].Index })

	response := ProjectionJourneyDetailResponse{
		ProjectionEnabled: true,
		Date:              date,
		Service: ProjectionJourneySummary{
			ServiceNumber:      detail.Service.ServiceNumber,
			ServiceDate:        projServiceDateToDate(detail.Service.ServiceDate),
			Status:             projStatusStr(detail.Service.IsCancelled),
			RouteType:          detail.Service.RouteType,
			TrainSetNumber:     detail.Service.TrainSetNumber,
			EquipmentType:      detail.Service.EquipmentType,
			OriginCode:         projectionShortCode(detail.Service.OriginCode),
			OriginName:         detail.Service.OriginName,
			DestinationCode:    projectionShortCode(detail.Service.DestinationCode),
			DestinationName:    detail.Service.DestinationName,
			ScheduledDeparture: detail.Service.ScheduledDeparture,
			ScheduledArrival:   detail.Service.ScheduledArrival,
		},
		Stops:     stops,
		Beacons:   projectionJourneyEvents(detail.Beacons, stopNames, "beacon"),
		GPS:       projectionJourneyEvents(detail.GPS, stopNames, "gps"),
		Bookings:  projectionJourneyBookings(bookings),
		Couplings: projectionJourneyCouplings(detail.Couplings),
		News:      projectionJourneyNews(news),
	}

	c.JSON(http.StatusOK, response)
}

type projectionStopEvent interface {
	GetStopCode() string
	GetEventType() string
	GetActualTime() string
	GetIsCorrection() bool
}

func (e projBeaconEvent) GetStopCode() string   { return e.StopCode }
func (e projBeaconEvent) GetEventType() string  { return e.EventType }
func (e projBeaconEvent) GetActualTime() string { return e.ActualTime }
func (e projBeaconEvent) GetIsCorrection() bool { return e.IsCorrection }
func (e projGPSEvent) GetStopCode() string      { return e.StopCode }
func (e projGPSEvent) GetEventType() string     { return e.EventType }
func (e projGPSEvent) GetActualTime() string    { return e.ActualTime }
func (e projGPSEvent) GetIsCorrection() bool    { return e.IsCorrection }

func projectionJourneyEvents[T projectionStopEvent](events []T, stopNames map[string]string, source string) []ProjectionJourneyEvent {
	items := make([]ProjectionJourneyEvent, 0, len(events))
	for _, event := range events {
		shortCode, _, _, _ := resolveStation(event.GetStopCode())
		items = append(items, ProjectionJourneyEvent{
			StopCode:     event.GetStopCode(),
			ShortCode:    shortCode,
			StopName:     stopNames[event.GetStopCode()],
			EventType:    event.GetEventType(),
			ActualTime:   event.GetActualTime(),
			IsCorrection: event.GetIsCorrection(),
			Source:       source,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ActualTime < items[j].ActualTime })
	return items
}

func projectionJourneyBookings(bookings []projBooking) []ProjectionJourneyBooking {
	items := make([]ProjectionJourneyBooking, 0, len(bookings))
	for _, booking := range bookings {
		originShort, _, _, _ := resolveStation(booking.OriginCode)
		destShort, _, _, _ := resolveStation(booking.DestCode)
		items = append(items, ProjectionJourneyBooking{
			OriginCode:   booking.OriginCode,
			OriginShort:  originShort,
			DestCode:     booking.DestCode,
			DestShort:    destShort,
			ServiceClass: booking.ServiceClass,
			Count:        booking.Count,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Count == items[j].Count {
			if items[i].OriginShort == items[j].OriginShort {
				return items[i].DestShort < items[j].DestShort
			}
			return items[i].OriginShort < items[j].OriginShort
		}
		return items[i].Count > items[j].Count
	})
	return items
}

func projectionBookingTotal(bookings []projBooking) int {
	total := 0
	for _, booking := range bookings {
		total += booking.Count
	}
	return total
}

func projectionBookingClassTotals(bookings []projBooking) []ProjectionBookingClassTotal {
	totals := make(map[string]int)
	for _, booking := range bookings {
		totals[booking.ServiceClass] += booking.Count
	}
	items := make([]ProjectionBookingClassTotal, 0, len(totals))
	for serviceClass, count := range totals {
		items = append(items, ProjectionBookingClassTotal{
			ServiceClass: serviceClass,
			Count:        count,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Count > items[j].Count })
	return items
}

func projectionBookingFlows(bookings []projBooking) []ProjectionBookingFlow {
	items := make([]ProjectionBookingFlow, 0, len(bookings))
	for _, booking := range bookings {
		originShort, _, _, _ := resolveStation(booking.OriginCode)
		destShort, _, _, _ := resolveStation(booking.DestCode)
		items = append(items, ProjectionBookingFlow{
			OriginCode:   booking.OriginCode,
			OriginShort:  originShort,
			DestCode:     booking.DestCode,
			DestShort:    destShort,
			ServiceClass: booking.ServiceClass,
			Count:        booking.Count,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Count > items[j].Count })
	if len(items) > 8 {
		items = items[:8]
	}
	return items
}

func projectionJourneyCouplings(couplings []projCoupling) []ProjectionJourneyCoupling {
	items := make([]ProjectionJourneyCoupling, 0, len(couplings))
	for _, coupling := range couplings {
		fromShort, _, _, _ := resolveStation(coupling.FromCode)
		toShort, _, _, _ := resolveStation(coupling.ToCode)
		items = append(items, ProjectionJourneyCoupling{
			FromCode:  coupling.FromCode,
			FromShort: fromShort,
			ToCode:    coupling.ToCode,
			ToShort:   toShort,
		})
	}
	return items
}

func projectionJourneyNews(news []projNews) []ProjectionJourneyNewsItem {
	items := make([]ProjectionJourneyNewsItem, 0, len(news))
	for _, item := range news {
		items = append(items, ProjectionJourneyNewsItem{
			ID:          item.ID,
			Department:  item.Department,
			Category:    item.Category,
			PublishedAt: item.PublishedAt,
			UpdatedAt:   item.UpdatedAt,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].PublishedAt > items[j].PublishedAt })
	return items
}

func filterProjectionBookingsForService(bookings []projBooking, serviceID string) []projBooking {
	if serviceID == "" {
		return nil
	}
	filtered := make([]projBooking, 0, len(bookings))
	for _, booking := range bookings {
		if booking.ServiceID == serviceID {
			filtered = append(filtered, booking)
		}
	}
	return filtered
}

func projectionShortCode(code string) string {
	shortCode, _, _, _ := resolveStation(code)
	return shortCode
}
