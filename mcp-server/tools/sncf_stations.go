package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func SearchSNCFStationsTool() mcp.Tool {
	return mcp.NewTool(
		"search_sncf_stations",
		mcp.WithDescription("Search for SNCF train stations in France by name. Returns matching stations with their IDs and coordinates."),
		mcp.WithString("query",
			mcp.Required(),
			mcp.Description("Station name to search for (e.g. 'Paris', 'Lyon', 'Bordeaux')"),
		),
	)
}

func HandleSearchSNCFStations(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		query := req.GetString("query", "")
		if query == "" {
			return mcp.NewToolResultError("'query' is required"), nil
		}

		places, err := client.SearchPlaces(query)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(places) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf("No stations found matching %q.", query)), nil
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "SNCF stations matching %q:\n\n", query)
		for _, p := range places {
			fmt.Fprintf(&sb, "• %s\n  ID: %s\n  Lat: %s, Lon: %s\n\n",
				p.Name, p.ID,
				p.StopArea.Coord.Lat,
				p.StopArea.Coord.Lon,
			)
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}
