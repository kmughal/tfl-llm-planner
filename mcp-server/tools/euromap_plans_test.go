package tools

import (
	"testing"

	"tfl-mcp-server/euromap"
)

func TestSelectBoundaryPlanUsesDepartureAtOrigin(t *testing.T) {
	plans := euromap.PlansResponse{
		{ServiceCode: "9001", Status: "active", DepartureDatetime: "2026-06-14T19:00:00Z", Stations: []euromap.Station{{ShortCode: "PNO", DepartureDatetime: "2026-06-14T20:10:00Z"}}},
		{ServiceCode: "9002", Status: "active", DepartureDatetime: "2026-06-14T19:30:00Z", Stations: []euromap.Station{{ShortCode: "PNO", DepartureDatetime: "2026-06-14T20:40:00Z"}}},
		{ServiceCode: "9003", Status: "cancelled", DepartureDatetime: "2026-06-14T20:00:00Z", Stations: []euromap.Station{{ShortCode: "PNO", DepartureDatetime: "2026-06-14T21:00:00Z"}}},
	}

	selected := selectBoundaryPlan(plans, "PNO", "last")
	if len(selected) != 1 || selected[0].ServiceCode != "9002" {
		t.Fatalf("selected %#v, want active service 9002", selected)
	}
}
