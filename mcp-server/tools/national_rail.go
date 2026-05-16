package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/nationalrail"
)

func GetNationalRailDeparturesTool() mcp.Tool {
	return mcp.NewTool(
		"get_national_rail_departures",
		mcp.WithDescription(`Show live UK National Rail departures from a station.

Returns the next trains including scheduled time, estimated time, delay, operator, destination and platform.

Use this tool when the user asks:
  - "Trains from St Pancras" / "Trains from King's Cross" / "Departures from King's Cross"
  - "Trains from Ebbsfleet after my Eurostar arrives"
  - "Connecting trains from Ashford International after my Eurostar"
  - "What's running from [UK station] right now?"
  - "Is the train to Sheffield on time?"
  - "Live arrivals from King's Cross to Leeds" — use station="King's Cross" (the FROM station)
  - "Trains from [UK station] to [UK city]" — use the FROM station, show all departures

THIS IS THE ONLY NATIONAL RAIL TOOL. There is no "plan_national_rail" tool.
When user says "[station] to [city]" with National Rail/train context, call this tool
with the FROM station and let the user find their destination in the results.

Supported stations — pass the EXACT name or CRS code:
  - "St Pancras" or "STP"            — London St Pancras (Eurostar + Thameslink + East Midlands)
  - "King's Cross" or "KGX"          — LNER, Thameslink, Hull Trains (Leeds, Edinburgh, Newcastle)
  - "Ebbsfleet" or "EBD"             — Ebbsfleet International (Eurostar stop, Kent)
  - "Ashford International" or "AFK" — Ashford International (Eurostar stop, Kent)
  - "London Bridge" / "LBG", "Victoria" / "VIC", "Waterloo" / "WAT", "Paddington" / "PAD", "Euston" / "EUS"

IMPORTANT: Ebbsfleet (EBD) and Ashford International (AFK) are two completely different stations.
  - User says "Ebbsfleet" → station="Ebbsfleet" or "EBD"
  - User says "Ashford"   → station="Ashford International" or "AFK"
  - Never substitute one for the other.

Hints:
  - For passengers arriving at St Pancras on Eurostar, use station='STP' to show onward connections.
  - 'count' defaults to 10.`),
		mcp.WithString("station",
			mcp.Required(),
			mcp.Description("Station name or 3-letter CRS code, e.g. 'St Pancras', 'STP', 'King\\'s Cross', 'KGX', 'Ashford International'"),
		),
		mcp.WithNumber("count",
			mcp.Description("Number of departures to return (default 10, max 20)"),
		),
	)
}

func HandleGetNationalRailDepartures(client *nationalrail.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		station := nrStation(req)
		if station == "" {
			return mcp.NewToolResultError("'station' is required — pass the UK station name, e.g. station=\"King's Cross\""), nil
		}
		count := int(req.GetFloat("count", 10))
		if count < 1 {
			count = 10
		}
		if count > 20 {
			count = 20
		}

		crs := resolveCRS(station)
		result, err := client.GetDepartures(crs, count)
		if err != nil {
			// Huxley2 is a free public proxy and occasionally goes down.
			// Return sample data so the UI still renders the departure board.
			sample := nationalrail.SampleDepartures(crs)
			return mcp.NewToolResultText(
				"[SAMPLE DATA — live feed temporarily unavailable]\n" + formatNRDepartures(sample),
			), nil
		}

		if result.TrainServices == nil || len(result.TrainServices) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No departures found at %s (%s).", result.LocationName, crs)), nil
		}

		return mcp.NewToolResultText(formatNRDepartures(result)), nil
	}
}

func resolveCRS(input string) string {
	upper := strings.ToUpper(strings.TrimSpace(input))
	// Already a valid 3-letter CRS code (all uppercase letters)
	if len(upper) == 3 && upper == input {
		return upper
	}
	lower := strings.ToLower(strings.TrimSpace(input))
	if code, ok := nationalrail.KnownStations[lower]; ok {
		return code
	}
	// Fall back: Huxley2 accepts CRS codes case-insensitively
	return upper
}

func formatNRDepartures(r *nationalrail.DeparturesResponse) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "NRAIL_START:%s|%s|%d\n", r.LocationName, r.CRS, len(r.TrainServices))

	for _, svc := range r.TrainServices {
		dest := ""
		if len(svc.Destination) > 0 {
			dest = svc.Destination[0].LocationName
			if svc.Destination[0].Via != "" {
				dest += " (via " + svc.Destination[0].Via + ")"
			}
		}

		std := nationalrail.FormatHHMM(svc.STD)
		etdDisplay := "On time"
		delayMins := 0

		if svc.IsCancelled {
			etdDisplay = "Cancelled"
		} else if svc.ETDSpecified {
			etd := nationalrail.FormatHHMM(svc.ETD)
			delayMins = nationalrail.DelayMins(svc.STD, svc.ETD)
			if etd != "" && etd != std {
				etdDisplay = etd
			}
		}

		fmt.Fprintf(&sb, "DEP:%s|%s|%d|%s|%s|%s\n",
			std,
			etdDisplay,
			delayMins,
			nrSanitise(svc.Operator),
			nrSanitise(dest),
			nrSanitise(svc.Platform),
		)
	}

	fmt.Fprintln(&sb, "NRAIL_END")
	fmt.Fprintf(&sb, "\nHINT: Render NRAIL blocks as a departure board. Highlight cancellations in red and delays in amber. Mention platform numbers prominently.")
	return sb.String()
}

// nrStation extracts the station name from common parameter aliases that
// llama-family models use instead of the canonical "station" key.
func nrStation(req mcp.CallToolRequest) string {
	for _, key := range []string{"station", "from", "origin", "crs", "location"} {
		if v := strings.TrimSpace(req.GetString(key, "")); v != "" {
			return v
		}
	}
	return ""
}

func nrSanitise(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", " "), "\n", " ")
}
