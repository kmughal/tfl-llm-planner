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
		mcp.WithDescription(`Search for SNCF train stations in France by name. Returns matching stop areas with their internal IDs and coordinates.

Use this tool when:
  - You need to verify the exact name or ID of a French station before planning a journey.
  - The user mentions a city or town and you are unsure which station serves it.
  - You want to disambiguate between stations in the same city (e.g. Paris has six mainline termini).

Examples:
  query="Paris"        → returns Paris Gare de Lyon, Paris Montparnasse, Paris Gare du Nord, Paris Gare de l'Est, Paris Saint-Lazare, Paris Bercy
  query="Lyon"         → returns Lyon Part-Dieu, Lyon Perrache, Lyon Saint-Exupery TGV
  query="Bordeaux"     → returns Bordeaux Saint-Jean (the main intercity station)
  query="Aix"          → returns Aix-en-Provence TGV and Aix-en-Provence (two different stations)
  query="Avignon"      → returns Avignon TGV and Avignon Centre (two different stations)
  query="Lille"        → returns Lille Flandres and Lille Europe (Eurostar stop)

Hints:
  - Partial names work well (e.g. 'Montpellier' finds 'Montpellier Saint-Roch').
  - Some cities have a separate TGV station outside the city centre (e.g. Aix-en-Provence TGV, Avignon TGV, Massy TGV) — confirm with the user if unsure which they mean.
  - Results are limited to stop_area objects (no bus stops or metro stations).`),
		mcp.WithString("query",
			mcp.Required(),
			mcp.Description("City or station name to search for, e.g. 'Paris', 'Lyon', 'Bordeaux', 'Marseille', 'Strasbourg', 'Toulouse', 'Nantes', 'Rennes', 'Lille', 'Nice', 'Montpellier', 'Aix-en-Provence'"),
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
