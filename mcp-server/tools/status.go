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
		mcp.WithDescription("Get current service status for one or more TFL lines. Returns severity, description and any disruption reason."),
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
		for _, s := range statuses {
			for _, st := range s.LineStatuses {
				fmt.Fprintln(&sb, formatStatusLine(s.Name, st))
			}
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
