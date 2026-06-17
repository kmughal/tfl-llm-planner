package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

var knownModes = []string{
	"tube", "dlr", "overground", "elizabeth-line",
	"bus", "national-rail", "tram", "cable-car",
}

func GetStatusByModeTool() mcp.Tool {
	return mcp.NewTool(
		"get_status_by_mode",
		mcp.WithDescription("Get a broad service-status overview for ALL TFL lines in one or more mode groups (TFL ONLY — not SNCF, not Eurostar). "+
			"Use for broad London questions: 'How are the tubes running?', 'Give me all TFL line statuses', 'Any disruptions on London transport today?'. "+
			"For a full London overview pass modes='tube,dlr,overground,elizabeth-line'. "+
			"Use only for an all-lines or mode-wide overview. For a single named line (e.g. 'Central line') use get_line_status instead. "+
			"For French train disruptions use get_sncf_disruptions. "+
			"For Eurostar services use get_euromap_plans."),
		mcp.WithString("modes",
			mcp.Required(),
			mcp.Description(fmt.Sprintf(
				"Comma-separated transport modes. Available: %s. For a full London overview use 'tube,dlr,overground,elizabeth-line'.",
				strings.Join(knownModes, ", "),
			)),
		),
	)
}

func HandleGetStatusByMode(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		modes := normalizeModes(req.GetString("modes", "tube"))

		statuses, err := client.GetLineStatusByMode(modes)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "TFL status for mode(s) [%s]:\n", modes)
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
			fmt.Fprintf(&sb, "\nHINT: %d line(s) have disruptions. If the user wants to travel, suggest using plan_journey which will automatically avoid disrupted lines. You can also call get_line_status with a specific disrupted line ID for more detail.", disrupted)
		} else {
			fmt.Fprintln(&sb, "\nHINT: All lines are running normally. If the user wants to travel, offer to plan a journey using plan_journey.")
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}

func normalizeModes(modes string) string {
	replacer := strings.NewReplacer(
		"underground", "tube",
		"tube lines", "tube",
		"london overground", "overground",
		"elizabeth line", "elizabeth-line",
		"elizabeth", "elizabeth-line",
		"national rail", "national-rail",
		"dler", "dlr",
	)
	allowed := map[string]bool{}
	for _, mode := range knownModes {
		allowed[mode] = true
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(knownModes))
	for _, raw := range strings.Split(strings.ToLower(modes), ",") {
		mode := strings.TrimSpace(replacer.Replace(raw))
		mode = strings.Trim(mode, "[]\"' ")
		if allowed[mode] && !seen[mode] {
			seen[mode] = true
			out = append(out, mode)
		}
	}
	if len(out) == 0 {
		return "tube,dlr,overground,elizabeth-line"
	}
	return strings.Join(out, ",")
}
