package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func GetAllBusLinesTool() mcp.Tool {
	return mcp.NewTool(
		"get_all_bus_lines",
		mcp.WithDescription(`Return the full list of London bus routes operated by TfL.

Use when the user asks:
  - "Show me all buses" / "List all bus routes" / "What buses are there?"
  - "Browse bus lines" / "Show all London buses" / "What bus routes does TfL have?"
  - "All bus numbers" / "How many bus routes are there in London?"

Returns every route (numbered and lettered) sorted numerically then alphabetically.
The frontend renders the result as an interactive animated grid of bus roundels.
Do NOT use for live arrivals — use get_bus_arrivals for that.`),
	)
}

func HandleGetAllBusLines(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		lines, err := client.GetAllBusLines()
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TfL API error: %v", err)), nil
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "BUS_LINES_START:%d\n", len(lines))
		for _, l := range lines {
			fmt.Fprintf(&sb, "BUS_LINE:%s|%s\n", sanitiseBus(l.ID), sanitiseBus(l.Name))
		}
		fmt.Fprintln(&sb, "BUS_LINES_END")
		fmt.Fprintf(&sb, "\nHINT: The frontend renders BUS_LINES as an interactive animated grid of bus roundels. Reply with 1 sentence only: how many routes are shown and that the user can click any to see live arrivals.")

		return mcp.NewToolResultText(sb.String()), nil
	}
}
