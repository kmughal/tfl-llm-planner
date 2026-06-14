package handlers

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"tfl-backend/llm"
)

type toolFamily string

const (
	familyTFL      toolFamily = "tfl"
	familyEurostar toolFamily = "eurostar"
	familySNCF     toolFamily = "sncf"
	familyNRail    toolFamily = "national-rail"
	familyParis    toolFamily = "paris"
	familyWeather  toolFamily = "weather"
)

var toolFamilies = map[string]toolFamily{
	"plan_journey":                     familyTFL,
	"get_line_status":                  familyTFL,
	"get_status_by_mode":               familyTFL,
	"search_stops":                     familyTFL,
	"get_bus_arrivals":                 familyTFL,
	"get_all_bus_lines":                familyTFL,
	"get_tfl_roads":                    familyTFL,
	"get_road_disruptions":             familyTFL,
	"get_euromap_plans":                familyEurostar,
	"get_euromap_technical_plans":      familyEurostar,
	"get_euromap_plan_by_id":           familyEurostar,
	"get_euromap_technical_plan_by_id": familyEurostar,
	"get_eurostar_dashboard":           familyEurostar,
	"get_eurostar_live_map":            familyEurostar,
	"get_traveler_summary":             familyEurostar,
	"get_crew_activities":              familyEurostar,
	"get_crew_monthly_schedule":        familyEurostar,
	"plan_sncf_journey":                familySNCF,
	"search_sncf_stations":             familySNCF,
	"get_sncf_disruptions":             familySNCF,
	"get_sncf_departures":              familySNCF,
	"get_sncf_arrivals":                familySNCF,
	"get_sncf_train":                   familySNCF,
	"get_sncf_dashboard":               familySNCF,
	"get_national_rail_departures":     familyNRail,
	"get_national_rail_arrivals":       familyNRail,
	"get_national_rail_dashboard":      familyNRail,
	"get_paris_metro_departures":       familyParis,
	"get_weather":                      familyWeather,
}

var toolAliases = map[string]string{
	"get_bus_lines":            "get_all_bus_lines",
	"get_all_buses":            "get_all_bus_lines",
	"get_road_status":          "get_tfl_roads",
	"get_tfl_road_status":      "get_tfl_roads",
	"get_ratp_departures":      "get_paris_metro_departures",
	"get_paris_rer_departures": "get_paris_metro_departures",
	"plan_national_rail":       "get_national_rail_departures",
	"get_euromap_dashboard":    "get_eurostar_dashboard",
	"get_euromap_live_map":     "get_eurostar_live_map",
}

var fourDigitService = regexp.MustCompile(`\b(9\d{3})\b`)
var weatherIntent = regexp.MustCompile(`(?i)\b(weather|rain|raining|temperature|forecast|umbrella|wind|windy|cold|hot)\b`)
var tflRoadID = regexp.MustCompile(`(?i)\ba\d{1,3}\b`)

// selectToolsForMessage reduces tool-choice ambiguity only for clearly named networks.
// Ambiguous follow-ups retain the complete tool list so conversation context still works.
func selectToolsForMessage(message string, tools []llm.Tool) []llm.Tool {
	families := detectToolFamilies(message)
	if len(families) == 0 {
		return tools
	}
	if families[familyEurostar] {
		return selectEurostarTools(message, tools)
	}
	if families[familySNCF] {
		return selectSNCFTools(message, tools)
	}
	if families[familyNRail] {
		return selectNationalRailTools(message, tools)
	}
	if families[familyTFL] {
		return selectTFLTools(message, tools)
	}

	selected := make([]llm.Tool, 0, len(tools))
	for _, tool := range tools {
		family, ok := toolFamilies[tool.Function.Name]
		if !ok || families[family] || family == familyWeather && asksForWeather(message) {
			selected = append(selected, tool)
		}
	}
	if len(selected) == 0 {
		return tools
	}
	return selected
}

func selectTFLTools(message string, tools []llm.Tool) []llm.Tool {
	q := strings.ToLower(message)
	wanted := map[string]bool{}

	switch {
	case containsAny(q, "road status", "road condition", "road conditions", "road update", "roads update", "traffic status", "traffic conditions", "tfl roads", "road network", "all roads", "managed roads"):
		wanted["get_tfl_roads"] = true
	case containsAny(q, "road disruption", "road disruptions", "road closure", "road closures", "roadworks", "road works", "traffic problem", "traffic problems"):
		wanted["get_road_disruptions"] = true
	case containsAny(q, "all buses", "all bus routes", "all bus lines", "all tfl buses", "all tfl bus routes", "all tfl bus lines", "browse buses", "browse bus routes", "list bus routes", "list bus lines", "bus network"):
		wanted["get_all_bus_lines"] = true
	case containsAny(q, "next bus", "bus arrival", "bus arrivals", "buses at", "bus at", "when is the"):
		wanted["get_bus_arrivals"] = true
	case containsAny(q, "find stop", "find station", "search stop", "search station", "stop code"):
		wanted["search_stops"] = true
	case containsAny(q, "line status", "status of the", "central line", "victoria line", "jubilee line", "northern line", "district line", "piccadilly line", "bakerloo line", "circle line", "metropolitan line", "waterloo & city", "hammersmith & city"):
		wanted["get_line_status"] = true
	case containsAny(q, "all tube", "tube status", "underground status", "overground status", "dlr status", "elizabeth line status", "status by mode"):
		wanted["get_status_by_mode"] = true
	case containsAny(q, " from ", " to ", "journey", "route", "travel", "get to", "directions"):
		wanted["plan_journey"] = true
	default:
		// A broad TfL status request is better served by the multimode status tool.
		wanted["get_status_by_mode"] = true
	}

	selected := make([]llm.Tool, 0, len(wanted))
	for _, tool := range tools {
		if wanted[tool.Function.Name] {
			selected = append(selected, tool)
		}
	}
	if len(selected) == 0 {
		return tools
	}
	return selected
}

func selectNationalRailTools(message string, tools []llm.Tool) []llm.Tool {
	q := strings.ToLower(message)
	wanted := "get_national_rail_departures"
	switch {
	case containsAny(q, "dashboard", "network overview", "operating picture", "operating overview", "major terminals", "major stations", "mainline overview"):
		wanted = "get_national_rail_dashboard"
	case containsAny(q, "arrivals", "arrival board", "arriving", "arrive at", "incoming trains", "trains into"):
		wanted = "get_national_rail_arrivals"
	}
	selected := make([]llm.Tool, 0, 1)
	for _, tool := range tools {
		if tool.Function.Name == wanted {
			selected = append(selected, tool)
		}
	}
	if len(selected) == 0 {
		return tools
	}
	return selected
}

var sncfTrainNumber = regexp.MustCompile(`(?i)\b(?:tgv|ter|ouigo|intercit[eé]s?|train)\s*(\d{3,6})\b`)

func selectSNCFTools(message string, tools []llm.Tool) []llm.Tool {
	q := strings.ToLower(message)
	wanted := map[string]bool{}

	switch {
	case containsAny(q, "dashboard", "network overview", "operating overview", "national overview", "major hubs", "network picture"):
		wanted["get_sncf_dashboard"] = true
	case sncfTrainNumber.MatchString(q) && containsAny(q, "stops", "schedule", "where", "route", "train", "tgv", "ter", "ouigo"):
		wanted["get_sncf_train"] = true
	case containsAny(q, "disruption", "disruptions", "cancelled", "canceled", "delay", "delays", "strike", "grève", "works", "incident"):
		wanted["get_sncf_disruptions"] = true
	case containsAny(q, "arrivals", "arriving", "arrive", "reaches", "reach"):
		wanted["get_sncf_arrivals"] = true
	case containsAny(q, "departures", "departing", "leaving", "leaves", "next trains from", "departure board"):
		wanted["get_sncf_departures"] = true
	case containsAny(q, "find station", "find sncf station", "search station", "search sncf station", "station code", "station id", "which station"):
		wanted["search_sncf_stations"] = true
	case containsAny(q, " to ", " from ", "journey", "travel", "trip", "route", "get to"):
		wanted["plan_sncf_journey"] = true
	default:
		wanted["get_sncf_disruptions"] = true
	}

	selected := make([]llm.Tool, 0, len(wanted))
	for _, tool := range tools {
		if wanted[tool.Function.Name] {
			selected = append(selected, tool)
		}
	}
	if len(selected) == 0 {
		return tools
	}
	return selected
}

// selectEurostarTools narrows the Eurostar family to the smallest useful tool
// set. This gives smaller local models a much clearer choice than advertising
// every commercial, technical, dashboard, map, and crew tool at once.
func selectEurostarTools(message string, tools []llm.Tool) []llm.Tool {
	q := strings.ToLower(message)
	wanted := map[string]bool{}
	hasService := fourDigitService.MatchString(q)

	switch {
	case containsAny(q, "monthly rota", "monthly schedule"):
		wanted["get_crew_monthly_schedule"] = true
	case containsAny(q, "live map", "map", "plot", "visualise", "visualize", "where are the trains", "train positions"):
		wanted["get_eurostar_live_map"] = true
	case containsAny(q, "passenger load", "passenger loads", "occupancy", "seat availability", "how busy", "traveller", "traveler", "capacity", "passenger numbers"):
		wanted["get_traveler_summary"] = true
	case containsAny(q, "crew", "driver", "train manager", "on duty", "roster", "rota", "who is driving"):
		wanted["get_crew_activities"] = true
	case hasService && containsAny(q, "technical", "operational", "engineering", "formation", "passage point"):
		wanted["get_euromap_technical_plan_by_id"] = true
	case hasService:
		wanted["get_euromap_plan_by_id"] = true
	case containsAny(q, "dashboard", "departure board", "full schedule", "all departures", "all services", "all trains", "cancelled", "canceled", "delayed", "disrupted", "disruption", "affected services"):
		wanted["get_eurostar_dashboard"] = true
	case containsAny(q, "technical", "operational plan", "engineering movement", "depot run"):
		wanted["get_euromap_technical_plans"] = true
	case asksForWeather(q) && !containsAny(q, "train", "service", "journey", "running", "departure"):
		wanted["get_weather"] = true
	default:
		wanted["get_euromap_plans"] = true
	}

	if asksForWeather(q) {
		wanted["get_weather"] = true
	}

	selected := make([]llm.Tool, 0, len(wanted))
	for _, tool := range tools {
		if wanted[tool.Function.Name] {
			selected = append(selected, tool)
		}
	}
	if len(selected) == 0 {
		return tools
	}
	return selected
}

func detectToolFamilies(message string) map[toolFamily]bool {
	q := strings.ToLower(message)
	families := map[toolFamily]bool{}

	if containsAny(q, "eurostar", "channel tunnel", "cross-channel", "cross channel") ||
		(strings.Contains(q, "london") && containsAny(q, "paris", "brussels", "amsterdam", "rotterdam")) {
		families[familyEurostar] = true
	}
	if containsAny(q, "tfl", "tube", "underground", "elizabeth line", "overground", "dlr", "london bus", "tfl road", "next bus", "bus arrival", "bus arrivals", "bus routes", "bus lines") ||
		(tflRoadID.MatchString(q) && containsAny(q, "road", "traffic", "closure", "roadwork", "disruption")) {
		families[familyTFL] = true
	}
	if containsAny(q, "sncf", "tgv", "ouigo", "french train", "france rail", "intercités", "intercites", "ter train") ||
		containsAny(q, "lyon part-dieu", "marseille saint-charles", "bordeaux saint-jean", "toulouse matabiau", "montpellier saint-roch", "lille flandres", "nice ville", "paris gare de lyon", "paris montparnasse", "paris gare de l'est") {
		families[familySNCF] = true
	}
	if containsAny(q, "national rail", "mainline", "rail departure", "rail arrival", "platform") ||
		(!containsAny(q, "tfl", "tube", "underground") && containsAny(q, "king's cross", "kings cross", "st pancras", "paddington", "waterloo", "victoria", "euston", "london bridge", "liverpool street", "ebbsfleet", "ashford international", "birmingham new street", "manchester piccadilly", "edinburgh waverley")) {
		families[familyNRail] = true
	}
	if containsAny(q, "paris metro", "paris rer", "rer b", "rer d", "transilien") {
		families[familyParis] = true
	}
	if asksForWeather(q) {
		families[familyWeather] = true
	}
	return families
}

func asksForWeather(message string) bool {
	return weatherIntent.MatchString(message)
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

// normalizeToolCall fixes common model mistakes before validation and execution.
func normalizeToolCall(call llm.ToolCall, userMessage string) llm.ToolCall {
	if canonical := toolAliases[call.Function.Name]; canonical != "" {
		call.Function.Name = canonical
	}

	args := map[string]any{}
	if call.Function.Arguments != "" && json.Unmarshal([]byte(call.Function.Arguments), &args) != nil {
		return call
	}

	switch call.Function.Name {
	case "get_road_disruptions":
		if roadID, ok := args["roadId"].(string); ok {
			args["roadId"] = strings.ToLower(strings.Trim(roadID, "[] \"'"))
		}
	case "get_line_status":
		if lines, ok := args["lines"].(string); ok {
			args["lines"] = normalizeLineIDs(lines)
		}
	case "get_status_by_mode":
		if modes, ok := args["modes"].(string); !ok || strings.TrimSpace(modes) == "" || strings.EqualFold(modes, "all") {
			args["modes"] = "tube,dlr,overground,elizabeth-line"
		}
	case "get_euromap_plan_by_id", "get_euromap_technical_plan_by_id":
		if date, ok := args["date"].(string); ok {
			args["date"] = strings.ReplaceAll(strings.TrimSpace(date), "-", "")
		}
		if _, hasPlan := args["planID"]; !hasPlan {
			if _, hasService := args["serviceCode"]; !hasService {
				if match := fourDigitService.FindStringSubmatch(userMessage); len(match) == 2 {
					args["serviceCode"] = match[1]
				}
			}
		}
	case "get_euromap_plans", "get_euromap_technical_plans", "get_eurostar_dashboard", "get_eurostar_live_map":
		if date, ok := args["fromDateTime"].(string); ok && len(strings.TrimSpace(date)) == 10 {
			args["fromDateTime"] = strings.TrimSpace(date) + "T00:00:00Z"
		}
		if call.Function.Name == "get_euromap_plans" {
			q := strings.ToLower(userMessage)
			if containsAny(q, "last eurostar", "last train", "last departure", "last service") {
				args["selection"] = "last"
			} else if containsAny(q, "first eurostar", "first train", "first departure", "first service") {
				args["selection"] = "first"
			}
			switch {
			case strings.Contains(q, "from paris"):
				args["from"] = "Paris"
			case strings.Contains(q, "from london"):
				args["from"] = "London"
			case strings.Contains(q, "from brussels"):
				args["from"] = "Brussels"
			case strings.Contains(q, "from amsterdam"):
				args["from"] = "Amsterdam"
			}
			if strings.Contains(q, " from ") && !strings.Contains(q, " to ") {
				delete(args, "to")
			}
		}
	case "get_crew_activities":
		if date, ok := args["date"].(string); ok {
			date = strings.TrimSpace(date)
			if len(date) == 8 && !strings.Contains(date, "-") {
				args["date"] = date[:4] + "-" + date[4:6] + "-" + date[6:]
			}
		}
		if _, ok := args["serviceCode"]; !ok {
			if match := fourDigitService.FindStringSubmatch(userMessage); len(match) == 2 {
				args["serviceCode"] = match[1]
			}
		}
	case "get_traveler_summary":
		if date, ok := args["travelDate"].(string); ok {
			date = strings.TrimSpace(date)
			if len(date) == 8 && !strings.Contains(date, "-") {
				args["travelDate"] = date[:4] + "-" + date[4:6] + "-" + date[6:]
			}
		}
		if _, ok := args["serviceCode"]; !ok {
			if match := fourDigitService.FindStringSubmatch(userMessage); len(match) == 2 {
				args["serviceCode"] = match[1]
			}
		}
	case "get_sncf_train":
		if _, ok := args["train_number"]; !ok {
			if match := sncfTrainNumber.FindStringSubmatch(userMessage); len(match) == 2 {
				args["train_number"] = match[1]
			}
		}
	case "get_sncf_departures", "get_sncf_arrivals":
		if count, ok := args["count"].(float64); ok {
			if count < 1 {
				args["count"] = 10
			} else if count > 20 {
				args["count"] = 20
			}
		}
	case "get_national_rail_departures", "get_national_rail_arrivals":
		if _, ok := args["station"]; !ok {
			aliases := []string{"location", "crs", "at"}
			if call.Function.Name == "get_national_rail_departures" {
				aliases = append(aliases, "from", "origin")
			} else {
				aliases = append(aliases, "to", "destination")
			}
			for _, alias := range aliases {
				if value, exists := args[alias]; exists {
					args["station"] = value
					delete(args, alias)
					break
				}
			}
		}
		if call.Function.Name == "get_national_rail_departures" {
			if value, ok := args["to"]; ok {
				args["destination"] = value
				delete(args, "to")
			}
		} else if value, ok := args["from"]; ok {
			args["origin"] = value
			delete(args, "from")
		}
		if count, ok := args["count"].(float64); ok {
			if count < 1 {
				args["count"] = 10
			}
			if count > 20 {
				args["count"] = 20
			}
		}
	case "get_bus_arrivals":
		if line, ok := args["line_id"].(float64); ok {
			args["line_id"] = strconv.FormatFloat(line, 'f', -1, 64)
		}
	}

	encoded, err := json.Marshal(args)
	if err == nil {
		call.Function.Arguments = string(encoded)
	}
	return call
}

func normalizeLineIDs(lines string) string {
	replacer := strings.NewReplacer(
		"hammersmith & city", "hammersmith-city",
		"waterloo & city", "waterloo-city",
		"london overground", "london-overground",
		"elizabeth line", "elizabeth",
	)
	parts := strings.Split(strings.ToLower(lines), ",")
	for i, part := range parts {
		parts[i] = strings.TrimSpace(replacer.Replace(part))
	}
	return strings.Join(parts, ",")
}

func selectedToolNames(tools []llm.Tool) string {
	names := make([]string, 0, len(tools))
	for _, tool := range tools {
		names = append(names, tool.Function.Name)
	}
	sort.Strings(names)
	return strings.Join(names, ",")
}
