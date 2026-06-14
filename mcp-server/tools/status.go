package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

var knownLines = []string{
	"bakerloo", "central", "circle", "district", "elizabeth",
	"hammersmith-city", "jubilee", "metropolitan", "northern",
	"piccadilly", "victoria", "waterloo-city",
	"dlr", "london-overground", "tram",
}

func GetLineStatusTool() mcp.Tool {
	return mcp.NewTool(
		"get_line_status",
		mcp.WithDescription(`Get current service status for one or more TFL (Transport for London) lines.
Returns severity, description and disruption reason for each queried line.

SCOPE — TFL NAMED RAIL LINES ONLY. Covers: Tube, DLR, Overground, Elizabeth line and tram.
NEVER use for French trains → use get_sncf_disruptions for SNCF.
NEVER use for Eurostar → use get_euromap_plans for cross-channel services.

Use this tool when the user asks about a SPECIFIC named London line, e.g.:
  - "Is the Central line running?"
  - "What's happening on the Jubilee line?"
  - "Is there a delay on the Piccadilly line?"
For ALL London lines at once use get_status_by_mode with modes='tube,dlr,overground,elizabeth-line'.`),
		mcp.WithString("lines",
			mcp.Description(fmt.Sprintf(
				"Comma-separated line IDs. Known lines: %s. Use 'all' for every tube line.",
				strings.Join(knownLines, ", "),
			)),
		),
	)
}

func HandleGetLineStatus(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		lines := resolveLines(req.GetString("lines", ""))

		statuses, err := client.GetLineStatus(lines)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}

		var sb strings.Builder
		fmt.Fprintln(&sb, "TFL Line Status:")
		disrupted := 0
		for _, s := range statuses {
			for _, st := range s.LineStatuses {
				fmt.Fprintln(&sb, formatStatusLine(s.Name, st))
				if st.StatusSeverity < 10 {
					disrupted++
				}
			}
		}

		if disrupted > 0 {
			fmt.Fprintf(&sb, "\nHINT: %d line(s) have disruptions. Summarise the disrupted lines clearly for the user. If they want to travel between two stations, call plan_journey — it will route around disruptions automatically.", disrupted)
		} else {
			fmt.Fprintln(&sb, "\nHINT: All queried lines are running normally. Tell the user good news concisely and offer to plan a journey if they have a destination in mind.")
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}

func resolveLines(input string) string {
	if input == "" || input == "all" {
		return strings.Join(knownLines, ",")
	}
	return input
}

func formatStatusLine(name string, st tfl.StatusDetail) string {
	icon := "✓"
	if st.StatusSeverity < 10 {
		icon = "⚠"
	}
	line := fmt.Sprintf("  %s %s: %s", icon, name, st.StatusSeverityDescription)
	if reason := firstSentence(st.Reason); reason != "" {
		line += " — " + reason
	}
	return line
}

func firstSentence(s string) string {
	if s == "" {
		return ""
	}
	if idx := strings.Index(s, "."); idx > 0 {
		return s[:idx+1]
	}
	return s
}
