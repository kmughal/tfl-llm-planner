package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func GetTFLRoadsTool() mcp.Tool {
	return mcp.NewTool(
		"get_tfl_roads",
		mcp.WithDescription(`Get all roads managed by TFL with their current traffic status.

Use when the user asks about:
  - TFL road network / road status overview
  - "What roads does TFL manage?"
  - "Are there any road issues on the TFL network?"
  - "TFL road conditions today"
	  - "Road status update operated by TFL"

Returns all TFL-managed A-roads with severity: Good, Moderate, Serious, or Severe.
This is the correct tool for broad road status or traffic-condition updates even when no road is named.
Do NOT use bus tools for road or traffic status. Do NOT use this for tube/rail/bus service status.`),
	)
}

func HandleGetTFLRoads(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		roads, err := client.GetRoads()
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}
		if len(roads) == 0 {
			return mcp.NewToolResultText("No TFL road data available."), nil
		}
		return mcp.NewToolResultText(formatRoads(roads)), nil
	}
}

func GetRoadDisruptionsTool() mcp.Tool {
	return mcp.NewTool(
		"get_road_disruptions",
		mcp.WithDescription(`Get active disruptions and closures on a specific TFL-managed road.

Use when the user asks about disruptions, closures, or works on a specific road:
  - "What disruptions are on the A1?"
  - "Is the A2 closed?"
  - "Any roadworks on the A40?"
  - "Traffic problems on A10"

Common TFL road IDs (use lowercase): a1, a2, a3, a4, a10, a13, a20, a21, a23,
a24, a40, a102, a200, a201, a202, a203, a205, a206, a211, a212, a214, a215,
a217, a219, a220, a221, a222, a224, a232, a298, a308, a316, a406`),
		mcp.WithString("roadId",
			mcp.Description("TFL road ID in lowercase, e.g. 'a1', 'a2', 'a40'."),
			mcp.Required(),
		),
	)
}

func HandleGetRoadDisruptions(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		roadID := strings.ToLower(strings.Trim(req.GetString("roadId", ""), "[] \"'"))
		if roadID == "" {
			return mcp.NewToolResultError("roadId is required (e.g. 'a1')"), nil
		}
		disruptions, err := client.GetRoadDisruptions(roadID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}
		roadName := strings.ToUpper(roadID)
		if len(disruptions) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("ROAD_DISRUPTIONS_START:%s|%s|0|0\nROAD_DISRUPTIONS_END\n\nNo active disruptions on %s — road is clear.", roadID, roadName, roadName)), nil
		}
		return mcp.NewToolResultText(formatRoadDisruptions(roadID, roadName, disruptions)), nil
	}
}

// ── Formatters ────────────────────────────────────────────────────────────────

func sanitiseRoad(s string) string {
	return strings.NewReplacer("|", " ", "\n", " ", "\r", "").Replace(s)
}

func roadCenter(boundsStr string) (lat, lon float64, ok bool) {
	if boundsStr == "" {
		return 0, 0, false
	}
	var b [][]float64
	if err := json.Unmarshal([]byte(boundsStr), &b); err != nil {
		return 0, 0, false
	}
	if len(b) < 2 || len(b[0]) < 2 || len(b[1]) < 2 {
		return 0, 0, false
	}
	// bounds: [[minLon,minLat],[maxLon,maxLat]]
	lon = (b[0][0] + b[1][0]) / 2
	lat = (b[0][1] + b[1][1]) / 2
	return lat, lon, true
}

func formatRoads(roads []tfl.Road) string {
	good, issues := 0, 0
	for _, r := range roads {
		if r.StatusSeverity == "Good" {
			good++
		} else {
			issues++
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "ROADS_START:%d|%d|%d\n", len(roads), good, issues)
	for _, r := range roads {
		lat, lon, hasCoords := roadCenter(r.Bounds)
		latStr, lonStr := "", ""
		if hasCoords {
			latStr = fmt.Sprintf("%.5f", lat)
			lonStr = fmt.Sprintf("%.5f", lon)
		}
		fmt.Fprintf(&sb, "ROAD:%s|%s|%s|%s|%s|%s\n",
			sanitiseRoad(r.ID),
			sanitiseRoad(r.DisplayName),
			sanitiseRoad(r.StatusSeverity),
			sanitiseRoad(r.StatusSeverityDescription),
			latStr, lonStr,
		)
	}
	fmt.Fprintln(&sb, "ROADS_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders ROADS blocks as an animated road status board with a map tab. Reply with 1–2 sentences only: total roads, how many are clear vs have issues.")
	return sb.String()
}

func formatRoadDisruptions(roadID, roadName string, disruptions []tfl.RoadDisruption) string {
	closures := 0
	for _, d := range disruptions {
		if d.HasClosures {
			closures++
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "ROAD_DISRUPTIONS_START:%s|%s|%d|%d\n", roadID, roadName, len(disruptions), closures)
	for _, d := range disruptions {
		text := d.CurrentUpdate
		if text == "" {
			text = d.Comment
		}
		if len(text) > 120 {
			text = text[:120]
		}
		start := roadDateTime(d.StartDateTime)
		end := roadDateTime(d.EndDateTime)
		closure := "false"
		if d.HasClosures {
			closure = "true"
		}
		fmt.Fprintf(&sb, "ROAD_DISRUPTION:%s|%s|%s|%s|%s|%s|%s\n",
			sanitiseRoad(d.Category),
			sanitiseRoad(d.Severity),
			sanitiseRoad(d.Street),
			sanitiseRoad(text),
			start, end, closure,
		)
	}
	fmt.Fprintln(&sb, "ROAD_DISRUPTIONS_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders ROAD_DISRUPTIONS as animated disruption cards. Reply with 1–2 sentences only: road name, disruption count, most severe issue.")
	return sb.String()
}

func roadDateTime(iso string) string {
	if len(iso) >= 16 {
		return iso[:16]
	}
	return iso
}
