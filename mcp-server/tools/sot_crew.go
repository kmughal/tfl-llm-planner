package tools

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sotenabler"
)

type dayResult struct {
	date       string
	activities []sotenabler.Activity
}

// ── Tool definitions ──────────────────────────────────────────────────────────

func GetCrewActivitiesTool() mcp.Tool {
	return mcp.NewTool(
		"get_crew_activities",
		mcp.WithDescription(`Fetch Eurostar crew (train drivers and staff) assigned to services on a given date.
Automatically enriches results with crew member names and contact details.

ALWAYS call this tool alongside any get_euromap_plans / get_euromap_plan_by_id call so that
driver information is shown next to every Eurostar train result.

Also call when the user asks:
  - "who is driving train [number] today / on [date]?"
  - "which drivers are on duty on [date]?"
  - "show me the crew for Eurostar services on [date]"

Date must be YYYY-MM-DD (resolve relative expressions like "this Sunday" using the date anchor table).`),
		mcp.WithString("date",
			mcp.Required(),
			mcp.Description("Operational date in YYYY-MM-DD format, e.g. '2026-04-17'."),
		),
		mcp.WithString("serviceCode",
			mcp.Description("Optional — filter to a specific train service code, e.g. '9113'."),
		),
	)
}

func GetCrewMonthlyScheduleTool() mcp.Tool {
	return mcp.NewTool(
		"get_crew_monthly_schedule",
		mcp.WithDescription(`Fetch all shifts for a specific crew member over an entire calendar month.
Queries the activities API for every day of the month concurrently, then filters by crewId.

Use when the user asks:
  - "show me [name/crewId]'s schedule for [month]"
  - "what shifts does [crewId] have in [month]?"
  - "give me the monthly rota for driver [crewId]"

crewId is the internal crew code (e.g. '3000078H').
Year and month default to the current month when omitted.`),
		mcp.WithString("crewId",
			mcp.Required(),
			mcp.Description("Crew member ID, e.g. '3000078H'."),
		),
		mcp.WithString("year",
			mcp.Description("4-digit year, e.g. '2026'. Defaults to current year."),
		),
		mcp.WithString("month",
			mcp.Description("2-digit month, e.g. '04' for April. Defaults to current month."),
		),
	)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func HandleGetCrewActivities(client *sotenabler.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		date := req.GetString("date", "")
		if date == "" {
			date = time.Now().UTC().Format("2006-01-02")
		}
		serviceFilter := req.GetString("serviceCode", "")

		activities, err := client.GetActivities(date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("crew activities error: %v", err)), nil
		}

		if serviceFilter != "" {
			var filtered []sotenabler.Activity
			for _, a := range activities {
				if a.ServiceCode == serviceFilter {
					filtered = append(filtered, a)
				}
			}
			activities = filtered
		}

		if len(activities) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No crew activities found for %s", date)), nil
		}

		// Collect unique crew IDs and enrich with agent details.
		seen := map[string]bool{}
		var ids []string
		for _, a := range activities {
			if !seen[a.CrewID] {
				seen[a.CrewID] = true
				ids = append(ids, a.CrewID)
			}
		}
		agents, _ := client.GetAgents(ids)
		agentMap := make(map[string]sotenabler.Agent, len(agents))
		for _, ag := range agents {
			agentMap[ag.EmployeeID] = ag
		}

		return mcp.NewToolResultText(formatCrewActivities(date, activities, agentMap)), nil
	}
}

func HandleGetCrewMonthlySchedule(client *sotenabler.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		crewID := req.GetString("crewId", "")
		if crewID == "" {
			return mcp.NewToolResultError("crewId is required"), nil
		}

		now := time.Now().UTC()
		yearStr := req.GetString("year", fmt.Sprintf("%d", now.Year()))
		monthStr := req.GetString("month", fmt.Sprintf("%02d", int(now.Month())))

		t, err := time.Parse("2006-01", yearStr+"-"+monthStr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid year/month: %v", err)), nil
		}

		// All days in the month.
		var dates []string
		for d := t; d.Month() == t.Month(); d = d.AddDate(0, 0, 1) {
			dates = append(dates, d.Format("2006-01-02"))
		}

		// Fetch concurrently.
		results := make([]dayResult, len(dates))
		var wg sync.WaitGroup
		for i, date := range dates {
			wg.Add(1)
			go func(i int, date string) {
				defer wg.Done()
				acts, _ := client.GetActivities(date)
				results[i] = dayResult{date: date, activities: acts}
			}(i, date)
		}
		wg.Wait()

		agents, _ := client.GetAgents([]string{crewID})
		var crewName string
		if len(agents) > 0 {
			crewName = strings.TrimSpace(agents[0].FirstName + " " + agents[0].LastName)
		}

		return mcp.NewToolResultText(formatMonthlySchedule(crewID, crewName, yearStr+"-"+monthStr, results)), nil
	}
}

// ── Formatters ────────────────────────────────────────────────────────────────

func sotFmtTime(dt string) string {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, dt); err == nil {
			return t.UTC().Format("15:04")
		}
	}
	return dt
}

func formatCrewActivities(date string, activities []sotenabler.Activity, agents map[string]sotenabler.Agent) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Crew on duty for %s — %d assignment(s):\n\n", date, len(activities))

	// Group by service.
	var svcOrder []string
	byService := map[string][]sotenabler.Activity{}
	for _, a := range activities {
		if _, ok := byService[a.ServiceCode]; !ok {
			svcOrder = append(svcOrder, a.ServiceCode)
		}
		byService[a.ServiceCode] = append(byService[a.ServiceCode], a)
	}

	for _, svc := range svcOrder {
		acts := byService[svc]
		a0 := acts[0]
		dep := sotFmtTime(a0.DepartureDatetime)
		arr := sotFmtTime(a0.ArrivalDatetime)
		fmt.Fprintf(&sb, "Service %s: %s → %s  %s–%s\n", svc, a0.Origin, a0.Destination, dep, arr)
		for _, a := range acts {
			ag := agents[a.CrewID]
			name := strings.TrimSpace(ag.FirstName + " " + ag.LastName)
			if name == "" {
				name = a.CrewID
			}
			fmt.Fprintf(&sb, "  %s | %s | %s | %s | %s\n", a.CrewType, a.CrewID, name, ag.Phone, ag.HomeDepot)
		}
	}

	// Machine-readable block for the frontend CrewCard.
	fmt.Fprintf(&sb, "\nCREW_DAY_START:%s\n", date)
	for _, a := range activities {
		ag := agents[a.CrewID]
		dep := sotFmtTime(a.DepartureDatetime)
		arr := sotFmtTime(a.ArrivalDatetime)
		fmt.Fprintf(&sb, "CREW_ROW:%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\n",
			a.CrewType, a.CrewID,
			ag.FirstName, ag.LastName, ag.Phone, ag.HomeDepot,
			a.ServiceCode, a.Origin, a.Destination, dep, arr,
		)
	}
	fmt.Fprintln(&sb, "CREW_DAY_END")
	return sb.String()
}

func formatMonthlySchedule(crewID, crewName, yearMonth string, results []dayResult) string {
	var sb strings.Builder

	displayName := crewName
	if displayName == "" {
		displayName = crewID
	}

	var shifts []sotenabler.Activity
	var shiftDates []string
	for _, r := range results {
		for _, a := range r.activities {
			if strings.EqualFold(a.CrewID, crewID) {
				shifts = append(shifts, a)
				shiftDates = append(shiftDates, r.date)
			}
		}
	}

	fmt.Fprintf(&sb, "Monthly schedule for %s (%s) — %s\n", displayName, crewID, yearMonth)
	fmt.Fprintf(&sb, "%d shift(s) found:\n\n", len(shifts))

	for i, a := range shifts {
		dep := sotFmtTime(a.DepartureDatetime)
		arr := sotFmtTime(a.ArrivalDatetime)
		d, _ := time.Parse("2006-01-02", shiftDates[i])
		fmt.Fprintf(&sb, "  %s (%s): Service %s — %s → %s  %s–%s\n",
			shiftDates[i], d.Weekday().String()[:3],
			a.ServiceCode, a.Origin, a.Destination, dep, arr,
		)
	}

	// Machine-readable block.
	fmt.Fprintf(&sb, "\nCREW_MONTHLY_START:%s|%s|%s\n", crewID, displayName, yearMonth)
	for i, a := range shifts {
		dep := sotFmtTime(a.DepartureDatetime)
		arr := sotFmtTime(a.ArrivalDatetime)
		d, _ := time.Parse("2006-01-02", shiftDates[i])
		fmt.Fprintf(&sb, "CREW_SHIFT:%s|%s|%s|%s|%s|%s|%s\n",
			shiftDates[i], d.Weekday().String()[:3],
			a.ServiceCode, a.Origin, a.Destination, dep, arr,
		)
	}
	fmt.Fprintln(&sb, "CREW_MONTHLY_END")
	return sb.String()
}
