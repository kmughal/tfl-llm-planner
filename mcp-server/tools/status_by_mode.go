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
		mcp.WithDescription("Get current service status for all lines belonging to one or more transport modes. Useful for a broad overview, e.g. all tube lines or all overground services."),
		mcp.WithString("modes",
			mcp.Required(),
			mcp.Description(fmt.Sprintf(
				"Comma-separated transport modes. Available: %s",
				strings.Join(knownModes, ", "),
			)),
		),
	)
}

func HandleGetStatusByMode(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		modes := req.GetString("modes", "tube")

		statuses, err := client.GetLineStatusByMode(modes)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "TFL status for mode(s) [%s]:\n", modes)
		for _, s := range statuses {
			for _, st := range s.LineStatuses {
				fmt.Fprintln(&sb, formatStatusLine(s.Name, st))
			}
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}
