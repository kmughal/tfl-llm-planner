package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ServiceState struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	UpdatedAt   string `json:"updatedAt"`
}

type serviceRegistry struct {
	mu       sync.RWMutex
	path     string
	services map[string]ServiceState
}

var globalServiceRegistry = &serviceRegistry{}

var defaultServiceStates = []ServiceState{
	{ID: "tfl", Label: "TfL", Description: "Tube, Elizabeth line, DLR, buses, roads and London journeys", Enabled: true},
	{ID: "eurostar", Label: "Eurostar", Description: "Euromap trains, schedules, maps and cross-channel services", Enabled: true},
	{ID: "sncf", Label: "SNCF", Description: "French national departures, arrivals and disruptions", Enabled: true},
	{ID: "national-rail", Label: "National Rail", Description: "UK mainline boards, hubs and onward movement", Enabled: true},
	{ID: "paris-rer", Label: "Paris RER", Description: "Paris interchange boards and suburban movement", Enabled: true},
	{ID: "weather", Label: "Weather", Description: "Travel weather and journey conditions", Enabled: true},
	{ID: "traveler", Label: "Traveler Load", Description: "Eurostar passenger load and cabin mix", Enabled: true},
	{ID: "crew", Label: "Crew / SOT", Description: "Start-on-Time crew activities and roster coverage", Enabled: true},
	{ID: "operations-wall", Label: "Operations Wall", Description: "Cross-border wall view that combines all live networks", Enabled: true},
}

func InitServiceRegistry(path string) error {
	globalServiceRegistry.mu.Lock()
	defer globalServiceRegistry.mu.Unlock()

	globalServiceRegistry.path = path
	globalServiceRegistry.services = make(map[string]ServiceState, len(defaultServiceStates))

	now := time.Now().UTC().Format(time.RFC3339)
	for _, service := range defaultServiceStates {
		service.UpdatedAt = now
		globalServiceRegistry.services[service.ID] = service
	}

	body, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return globalServiceRegistry.persistLocked()
		}
		return err
	}

	var stored []ServiceState
	if err := json.Unmarshal(body, &stored); err != nil {
		return err
	}
	for _, service := range stored {
		base, ok := globalServiceRegistry.services[service.ID]
		if !ok {
			continue
		}
		if service.Label == "" {
			service.Label = base.Label
		}
		if service.Description == "" {
			service.Description = base.Description
		}
		if service.UpdatedAt == "" {
			service.UpdatedAt = now
		}
		globalServiceRegistry.services[service.ID] = service
	}
	return nil
}

func (r *serviceRegistry) persistLocked() error {
	services := make([]ServiceState, 0, len(r.services))
	for _, service := range r.services {
		services = append(services, service)
	}
	sort.Slice(services, func(i, j int) bool { return services[i].Label < services[j].Label })
	body, err := json.MarshalIndent(services, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.path, body, 0644)
}

func ListServiceStates() []ServiceState {
	globalServiceRegistry.mu.RLock()
	defer globalServiceRegistry.mu.RUnlock()

	services := make([]ServiceState, 0, len(globalServiceRegistry.services))
	for _, service := range globalServiceRegistry.services {
		services = append(services, service)
	}
	sort.Slice(services, func(i, j int) bool { return services[i].Label < services[j].Label })
	return services
}

func UpdateServiceStates(updates []ServiceState) error {
	globalServiceRegistry.mu.Lock()
	defer globalServiceRegistry.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	for _, update := range updates {
		current, ok := globalServiceRegistry.services[update.ID]
		if !ok {
			continue
		}
		current.Enabled = update.Enabled
		current.UpdatedAt = now
		globalServiceRegistry.services[update.ID] = current
	}
	return globalServiceRegistry.persistLocked()
}

func IsServiceEnabled(id string) bool {
	globalServiceRegistry.mu.RLock()
	defer globalServiceRegistry.mu.RUnlock()
	service, ok := globalServiceRegistry.services[id]
	if !ok {
		return true
	}
	return service.Enabled
}

func DisabledServiceMessage(id string) string {
	for _, service := range ListServiceStates() {
		if service.ID == id {
			return service.Label + " has been disabled in Config > Services."
		}
	}
	return "This service has been disabled in Config > Services."
}

func serviceDisabledJSON(c *gin.Context, id string) {
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"disabled": true,
		"service":  id,
		"error":    DisabledServiceMessage(id),
	})
}

func GetServiceStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"services": ListServiceStates()})
}

func UpdateServiceStatus(c *gin.Context) {
	var req struct {
		Services []ServiceState `json:"services"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := UpdateServiceStates(req.Services); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "services": ListServiceStates()})
}

func serviceIDForTool(name string) string {
	switch name {
	case "plan_journey", "get_line_status", "get_status_by_mode", "search_stops", "get_bus_arrivals", "get_all_bus_lines", "get_tfl_roads", "get_road_disruptions":
		return "tfl"
	case "get_euromap_plans", "get_euromap_technical_plans", "get_euromap_plan_by_id", "get_euromap_technical_plan_by_id", "get_eurostar_dashboard", "get_eurostar_live_map":
		return "eurostar"
	case "get_traveler_summary":
		return "traveler"
	case "get_crew_activities", "get_crew_monthly_schedule":
		return "crew"
	case "plan_sncf_journey", "search_sncf_stations", "get_sncf_disruptions", "get_sncf_departures", "get_sncf_arrivals", "get_sncf_train", "get_sncf_dashboard":
		return "sncf"
	case "get_national_rail_departures", "get_national_rail_arrivals", "get_national_rail_dashboard":
		return "national-rail"
	case "get_paris_metro_departures":
		return "paris-rer"
	case "get_weather":
		return "weather"
	default:
		return ""
	}
}
