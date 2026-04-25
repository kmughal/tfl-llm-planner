package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func SearchStopsTool() mcp.Tool {
	return mcp.NewTool(
		"search_stops",
		mcp.WithDescription("Search for TFL stop points (stations, bus stops) by name or partial name. Useful for resolving ambiguous location names before planning a journey."),
		mcp.WithString("query",
			mcp.Required(),
			mcp.Description("Name or partial name to search, e.g. 'King's Cross', 'Waterloo'"),
		),
	)
}

func HandleSearchStops(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		query := req.GetString("query", "")
		if query == "" {
			return mcp.NewToolResultError("'query' is required"), nil
		}

		result, err := client.SearchStops(query)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TFL API error: %v", err)), nil
		}

		if len(result.Matches) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No stops found matching %q", query)), nil
		}

		matches := result.Matches
		if len(matches) > 8 {
			matches = matches[:8]
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "Stop points matching %q:\n", query)
		for _, m := range matches {
			modes := strings.Join(m.Modes, ", ")
			fmt.Fprintf(&sb, "  • %s [%s] (modes: %s)\n", m.Name, m.ID, modes)
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}
