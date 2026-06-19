package handlers

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"tfl-backend/llm"
)

func tool(name string) llm.Tool {
	return llm.Tool{Type: "function", Function: llm.ToolFunction{Name: name}}
}

func call(name, args string) llm.ToolCall {
	return llm.ToolCall{ID: "call-1", Type: "function", Function: llm.FunctionCall{Name: name, Arguments: args}}
}

func argsOf(t *testing.T, tc llm.ToolCall) map[string]any {
	t.Helper()
	var args map[string]any
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
		t.Fatalf("decode arguments: %v", err)
	}
	return args
}

func TestSelectToolsForExplicitEurostarQuery(t *testing.T) {
	tools := []llm.Tool{tool("get_euromap_plans"), tool("get_crew_activities"), tool("get_line_status"), tool("get_weather")}
	selected := selectToolsForMessage("Show Eurostar trains from London to Paris", tools)
	if got := selectedToolNames(selected); got != "get_euromap_plans" {
		t.Fatalf("unexpected selection: %s", selectedToolNames(selected))
	}
}

func TestSelectToolsKeepsAllForAmbiguousFollowUp(t *testing.T) {
	tools := []llm.Tool{tool("get_euromap_plans"), tool("get_line_status")}
	selected := selectToolsForMessage("What about tomorrow?", tools)
	if len(selected) != len(tools) {
		t.Fatalf("expected all tools, got %s", selectedToolNames(selected))
	}
}

func TestSelectToolsAllowsWeatherWithEurostar(t *testing.T) {
	tools := []llm.Tool{tool("get_euromap_plans"), tool("get_line_status"), tool("get_weather")}
	selected := selectToolsForMessage("Eurostar weather in London and Paris", tools)
	if got := selectedToolNames(selected); got != "get_weather" {
		t.Fatalf("unexpected selection: %s", got)
	}
}

func TestSelectToolsForSpecificEurostarService(t *testing.T) {
	tools := []llm.Tool{
		tool("get_euromap_plans"), tool("get_euromap_plan_by_id"),
		tool("get_eurostar_dashboard"), tool("get_crew_activities"),
	}
	selected := selectToolsForMessage("Is Eurostar 9114 running today?", tools)
	if got := selectedToolNames(selected); got != "get_euromap_plan_by_id" {
		t.Fatalf("unexpected selection: %s", got)
	}
}

func TestSelectToolsForEurostarViews(t *testing.T) {
	tools := []llm.Tool{
		tool("get_euromap_plans"), tool("get_eurostar_live_map"),
		tool("get_eurostar_dashboard"), tool("get_crew_activities"),
	}
	tests := []struct{ message, want string }{
		{"Show the Eurostar live map", "get_eurostar_live_map"},
		{"Show a Eurostar map with crew assignments", "get_eurostar_live_map"},
		{"Show all cancelled Eurostar services", "get_eurostar_dashboard"},
		{"Who is on the Eurostar crew today?", "get_crew_activities"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestSelectToolsForEurostarOperationalIntents(t *testing.T) {
	tools := []llm.Tool{
		tool("get_euromap_plans"), tool("get_euromap_plan_by_id"),
		tool("get_euromap_technical_plan_by_id"), tool("get_euromap_technical_plans"),
		tool("get_eurostar_dashboard"), tool("get_eurostar_live_map"),
		tool("get_crew_activities"), tool("get_crew_monthly_schedule"),
		tool("get_traveler_summary"),
	}
	tests := []struct{ message, want string }{
		{"How busy is Eurostar 9114 today?", "get_traveler_summary"},
		{"Who is driving Eurostar 9114 today?", "get_crew_activities"},
		{"Show the technical formation for Eurostar 9114", "get_euromap_technical_plan_by_id"},
		{"Show Eurostar engineering movements today", "get_euromap_technical_plans"},
		{"Eurostar monthly rota for crew 3000078H", "get_crew_monthly_schedule"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestSelectToolsForSNCFIntents(t *testing.T) {
	tools := []llm.Tool{
		tool("plan_sncf_journey"), tool("search_sncf_stations"),
		tool("get_sncf_disruptions"), tool("get_sncf_departures"),
		tool("get_sncf_arrivals"), tool("get_sncf_train"), tool("get_line_status"),
		tool("get_sncf_dashboard"),
	}
	tests := []struct{ message, want string }{
		{"SNCF journey from Paris to Lyon", "plan_sncf_journey"},
		{"SNCF departures from Lyon Part-Dieu", "get_sncf_departures"},
		{"SNCF arrivals at Bordeaux Saint-Jean", "get_sncf_arrivals"},
		{"Any SNCF strikes or delays today?", "get_sncf_disruptions"},
		{"Where does TGV 6123 stop?", "get_sncf_train"},
		{"Find SNCF station Marseille Saint-Charles", "search_sncf_stations"},
		{"Departures from Lyon Part-Dieu", "get_sncf_departures"},
		{"Show the SNCF network dashboard", "get_sncf_dashboard"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestSelectToolsForNationalRailIntents(t *testing.T) {
	tools := []llm.Tool{
		tool("get_national_rail_departures"), tool("get_national_rail_arrivals"),
		tool("get_national_rail_dashboard"), tool("plan_journey"),
	}
	tests := []struct{ message, want string }{
		{"National Rail departures from King's Cross", "get_national_rail_departures"},
		{"Arrivals at London Euston", "get_national_rail_arrivals"},
		{"Show the National Rail operating picture", "get_national_rail_dashboard"},
		{"Trains from St Pancras to Brighton", "get_national_rail_departures"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestSelectToolsForTFLIntents(t *testing.T) {
	tools := []llm.Tool{
		tool("plan_journey"), tool("get_line_status"), tool("get_status_by_mode"),
		tool("search_stops"), tool("get_bus_arrivals"), tool("get_all_bus_lines"),
		tool("get_tfl_roads"), tool("get_road_disruptions"),
	}
	tests := []struct{ message, want string }{
		{"Road status update operated by TFL", "get_tfl_roads"},
		{"TfL road conditions today", "get_tfl_roads"},
		{"How are the roads looking like operated by TfL", "get_tfl_roads"},
		{"Show all TfL bus routes", "get_all_bus_lines"},
		{"Next bus at Oxford Circus", "get_bus_arrivals"},
		{"Any roadworks on the A40?", "get_road_disruptions"},
		{"TfL Central line status", "get_line_status"},
		{"TfL Underground status", "get_status_by_mode"},
		{"All tube line status right now", "get_status_by_mode"},
		{"TfL journey from Victoria to Stratford", "plan_journey"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestSelectToolsForParisIntents(t *testing.T) {
	tools := []llm.Tool{
		tool("get_paris_metro_departures"), tool("get_sncf_departures"),
		tool("get_sncf_disruptions"), tool("plan_sncf_journey"), tool("get_status_by_mode"),
	}
	tests := []struct{ message, want string }{
		{"RER B departures from Gare du Nord", "get_paris_metro_departures"},
		{"How do I get into Paris from Gare du Nord?", "get_paris_metro_departures"},
		{"Next trains from Gare de Lyon", "get_paris_metro_departures"},
		{"Paris transit from Chatelet les Halles", "get_paris_metro_departures"},
		{"If Eurostar into Paris is late, what are the best onward options right now?", "get_paris_metro_departures,get_sncf_departures,get_sncf_disruptions"},
	}
	for _, tt := range tests {
		if got := selectedToolNames(selectToolsForMessage(tt.message, tools)); got != tt.want {
			t.Fatalf("%q selected %s, want %s", tt.message, got, tt.want)
		}
	}
}

func TestNormalizeAliasesAndArguments(t *testing.T) {
	tests := []struct {
		name      string
		input     llm.ToolCall
		message   string
		wantName  string
		wantKey   string
		wantValue string
	}{
		{"bus alias", call("get_bus_lines", `{}`), "show all buses", "get_all_bus_lines", "", ""},
		{"road id", call("get_road_disruptions", `{"roadId":"[A40]"}`), "A40 closures", "get_road_disruptions", "roadId", "a40"},
		{"road fallback to network view", call("get_road_disruptions", `{"roadId":""}`), "Road status update operated by TFL", "get_tfl_roads", "", ""},
		{"road infer from message", call("get_road_disruptions", `{}`), "Any roadworks on the A40?", "get_road_disruptions", "roadId", "a40"},
		{"line ids", call("get_line_status", `{"lines":"Elizabeth Line, Hammersmith & City"}`), "line status", "get_line_status", "lines", "elizabeth,hammersmith-city"},
		{"bus number", call("get_bus_arrivals", `{"line_id":170}`), "when is the 170", "get_bus_arrivals", "line_id", "170"},
		{"service extraction", call("get_euromap_plan_by_id", `{}`), "is Eurostar 9114 running?", "get_euromap_plan_by_id", "serviceCode", "9114"},
		{"crew service extraction", call("get_crew_activities", `{"date":"20260613"}`), "crew for 9114", "get_crew_activities", "serviceCode", "9114"},
		{"dashboard date", call("get_eurostar_dashboard", `{"fromDateTime":"2026-06-13"}`), "dashboard", "get_eurostar_dashboard", "fromDateTime", "2026-06-13T00:00:00Z"},
		{"last train selector", call("get_euromap_plans", `{"fromDateTime":"2026-06-14"}`), "Last Eurostar from Paris tonight", "get_euromap_plans", "selection", "last"},
		{"strip accidental first selector", call("get_euromap_plans", `{"from":"Paris","selection":"first"}`), "Find a train for me from Paris using Eurostar", "get_euromap_plans", "from", "Paris"},
		{"take train from paris now", call("get_euromap_plans", `{"from":"Paris","fromDateTime":"2026-06-17T00:00:00Z","to":"PNO"}`), "I want to take a train from Paris using Eurostar", "get_euromap_plans", "from", "Paris"},
		{"traveler service extraction", call("get_traveler_summary", `{"travelDate":"20260613"}`), "load for Eurostar 9114", "get_traveler_summary", "serviceCode", "9114"},
		{"traveler today override", call("get_traveler_summary", `{"travelDate":"2026-06-18"}`), "how is passenger load looking today on eurostar", "get_traveler_summary", "travelDate", time.Now().UTC().Format(dateFmt)},
		{"status by mode typo fix", call("get_status_by_mode", `{"modes":"tube,dler,overground,elizabeth line","lines":"all"}`), "all tube line status right now", "get_status_by_mode", "modes", "tube,dlr,overground,elizabeth-line"},
		{"status by mode singular alias", call("get_status_by_mode", `{"mode":"tube"}`), "all tube line status right now", "get_status_by_mode", "modes", "tube"},
		{"paris station normalization", call("get_paris_metro_departures", `{"from":"chatelet les halles","count":99}`), "Paris transit from Chatelet les Halles", "get_paris_metro_departures", "station", "Chatelet"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeToolCall(tt.input, tt.message)
			if got.Function.Name != tt.wantName {
				t.Fatalf("name = %s, want %s", got.Function.Name, tt.wantName)
			}
			if tt.wantKey == "" {
				return
			}
			args := argsOf(t, got)
			if value, _ := args[tt.wantKey].(string); value != tt.wantValue {
				t.Fatalf("%s = %q, want %q", tt.wantKey, value, tt.wantValue)
			}
			if tt.name == "status by mode typo fix" {
				if _, exists := args["lines"]; exists {
					t.Fatalf("lines should be removed for get_status_by_mode: %#v", args)
				}
			}
			if tt.name == "strip accidental first selector" {
				if _, exists := args["selection"]; exists {
					t.Fatalf("selection should be removed unless explicitly requested: %#v", args)
				}
				value, _ := args["fromDateTime"].(string)
				if value == "" || !strings.Contains(value, "T") {
					t.Fatalf("fromDateTime should be set to a current timestamp for immediate queries: %#v", args)
				}
			}
			if tt.name == "take train from paris now" {
				if _, exists := args["to"]; exists {
					t.Fatalf("to should be removed when no explicit destination was requested: %#v", args)
				}
				value, _ := args["fromDateTime"].(string)
				if value == "" || !strings.Contains(value, "T") || strings.HasSuffix(value, "T00:00:00Z") {
					t.Fatalf("fromDateTime should be set close to now for immediate queries: %#v", args)
				}
			}
			if tt.name == "paris station normalization" {
				if _, exists := args["from"]; exists {
					t.Fatalf("from should be normalized away for get_paris_metro_departures: %#v", args)
				}
				if value, _ := args["count"].(float64); value != 20 {
					t.Fatalf("count should be clamped to 20, got %#v", args["count"])
				}
			}
		})
	}
}

func TestNormalizeLastEurostarOverridesConflictingOrigin(t *testing.T) {
	got := normalizeToolCall(call("get_euromap_plans", `{"from":"London","to":"PNO","fromDateTime":"2026-06-14"}`), "Last Eurostar from Paris tonight")
	args := argsOf(t, got)
	if args["from"] != "Paris" || args["selection"] != "last" {
		t.Fatalf("normalized args = %#v, want Paris and last", args)
	}
	if _, exists := args["to"]; exists {
		t.Fatalf("normalized args retained invented destination: %#v", args)
	}
}

func TestValidMemoryKey(t *testing.T) {
	for _, value := range []string{"abc-123", "session_id", "A1"} {
		if !validMemoryKey(value) {
			t.Fatalf("expected %q to be valid", value)
		}
	}
	for _, value := range []string{"", "has space", "../../memory", strings.Repeat("x", 129)} {
		if validMemoryKey(value) {
			t.Fatalf("expected %q to be invalid", value)
		}
	}
}

func TestTruncateRunesPreservesUnicode(t *testing.T) {
	if got := truncateRunes("London → Paris", 8); got != "London →…" {
		t.Fatalf("truncateRunes = %q", got)
	}
}
