package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func PlanSNCFJourneyTool() mcp.Tool {
	return mcp.NewTool(
		"plan_sncf_journey",
		mcp.WithDescription(`Plan a domestic train journey within France on the SNCF network (TGV, Intercités, TER, Ouigo).

Use this tool when BOTH the origin AND destination are cities or stations inside France.
Do NOT use for any journey that crosses into the UK or goes through the Channel Tunnel — use get_euromap_plans for those.

Common routes:
  Paris → Lyon         (~2h by TGV, departs Paris Gare de Lyon)
  Paris → Marseille    (~3h20 by TGV, departs Paris Gare de Lyon)
  Paris → Bordeaux     (~2h10 by TGV, departs Paris Montparnasse)
  Paris → Strasbourg   (~1h50 by TGV, departs Paris Gare de l'Est)
  Paris → Nantes       (~2h10 by TGV, departs Paris Montparnasse)
  Paris → Lille        (~1h by TGV, departs Paris Gare du Nord)
  Lyon → Marseille     (~1h40 by TGV)
  Bordeaux → Toulouse  (~2h10 by TGV)

Hints:
  - Use the full station name when possible (e.g. 'Paris Gare de Lyon' not just 'Paris') to avoid ambiguity.
  - Paris has several mainline termini — each serves different regions:
      Gare de Lyon   → southeast (Lyon, Marseille, Nice, Geneva)
      Montparnasse   → southwest (Bordeaux, Nantes, Toulouse, Rennes)
      Gare du Nord   → north (Lille, Calais, Eurostar)
      Gare de l'Est  → east (Strasbourg, Reims, Metz)
      Saint-Lazare   → northwest (Normandy, Cherbourg)
  - If the user says 'Paris' without a terminus, infer the correct one from the destination.
  - Omit 'datetime' to get the next available trains.`),
		mcp.WithString("from",
			mcp.Required(),
			mcp.Description("Origin station name, e.g. 'Paris Gare de Lyon', 'Paris Montparnasse', 'Lyon Part-Dieu', 'Bordeaux Saint-Jean', 'Marseille Saint-Charles', 'Strasbourg', 'Toulouse Matabiau', 'Nice Ville', 'Nantes', 'Rennes'"),
		),
		mcp.WithString("to",
			mcp.Required(),
			mcp.Description("Destination station name, e.g. 'Lyon Part-Dieu', 'Marseille Saint-Charles', 'Bordeaux Saint-Jean', 'Toulouse Matabiau', 'Strasbourg', 'Nantes', 'Rennes', 'Nice Ville', 'Montpellier Saint-Roch', 'Lille Flandres'"),
		),
		mcp.WithString("datetime",
			mcp.Description("Desired departure date and time in YYYYMMDDTHHmmss format, e.g. '20260602T083000' for 2 June 2026 at 08:30. Omit to get the next available departures from now."),
		),
	)
}

func HandlePlanSNCFJourney(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		from := req.GetString("from", "")
		to := req.GetString("to", "")
		datetime := req.GetString("datetime", "")

		if from == "" || to == "" {
			return mcp.NewToolResultError("'from' and 'to' are required"), nil
		}

		// Resolve station names to IDs
		fromPlaces, err := client.SearchPlaces(from)
		if err != nil || len(fromPlaces) == 0 {
			return mcp.NewToolResultError(fmt.Sprintf("Could not find station %q: %v", from, err)), nil
		}
		toPlaces, err := client.SearchPlaces(to)
		if err != nil || len(toPlaces) == 0 {
			return mcp.NewToolResultError(fmt.Sprintf("Could not find station %q: %v", to, err)), nil
		}

		fromID := fromPlaces[0].ID
		fromName := fromPlaces[0].Name
		toID := toPlaces[0].ID
		toName := toPlaces[0].Name

		result, err := client.PlanJourney(fromID, toID, datetime, 3)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.Journeys) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No journeys found from %s to %s.", fromName, toName)), nil
		}

		return mcp.NewToolResultText(formatSNCFJourneys(fromName, toName, result.Journeys)), nil
	}
}

func formatSNCFJourneys(from, to string, journeys []sncf.Journey) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "SNCF journeys from %s to %s:\n\n", from, to)

	for i, j := range journeys {
		mins := j.Duration / 60
		hours := mins / 60
		mins = mins % 60

		fmt.Fprintf(&sb, "Option %d — ", i+1)
		if hours > 0 {
			fmt.Fprintf(&sb, "%dh%02dmin", hours, mins)
		} else {
			fmt.Fprintf(&sb, "%d min", mins)
		}
		if j.NbTransfers > 0 {
			fmt.Fprintf(&sb, " | %d connection(s)", j.NbTransfers)
		} else {
			fmt.Fprintf(&sb, " | Direct")
		}
		fmt.Fprintf(&sb, "\n  Departs: %s | Arrives: %s\n",
			formatSNCFTime(j.DepartureDatetime),
			formatSNCFTime(j.ArrivalDatetime),
		)

		// Collect unique route stops from all public-transport sections
		type stopInfo struct{ name, time string }
		var stops []stopInfo
		for _, sec := range j.Sections {
			if sec.Type == "waiting" || sec.Type == "crow_fly" || sec.Type == "street_network" {
				continue
			}
			fromTime := formatSNCFTime(sec.DepartureDatetime)
			toTime := formatSNCFTime(sec.ArrivalDatetime)
			if len(stops) == 0 || stops[len(stops)-1].name != sec.From.Name {
				stops = append(stops, stopInfo{sec.From.Name, fromTime})
			}
			stops = append(stops, stopInfo{sec.To.Name, toTime})
		}
		for _, s := range stops {
			if s.time != "" {
				fmt.Fprintf(&sb, "  Stop: %s (%s)\n", s.name, s.time)
			} else {
				fmt.Fprintf(&sb, "  Stop: %s\n", s.name)
			}
		}

		stepNum := 0
		for _, sec := range j.Sections {
			if sec.Type == "waiting" || sec.Type == "crow_fly" || sec.Type == "street_network" {
				continue
			}
			stepNum++
			secMins := sec.Duration / 60
			if sec.DisplayInfo != nil {
				fmt.Fprintf(&sb, "  Step %d: %s %s → %s (%d min)\n",
					stepNum,
					sec.DisplayInfo.CommercialMode,
					sec.DisplayInfo.Label,
					sec.DisplayInfo.Direction,
					secMins,
				)
			} else {
				fmt.Fprintf(&sb, "  Step %d: %s → %s (%d min)\n",
					stepNum, sec.From.Name, sec.To.Name, secMins,
				)
			}
		}
		fmt.Fprintln(&sb)
	}
	return sb.String()
}

// formatSNCFTime converts "20260425T090000" to "09:00".
func formatSNCFTime(dt string) string {
	if len(dt) >= 15 {
		return dt[9:11] + ":" + dt[11:13]
	}
	return dt
}
