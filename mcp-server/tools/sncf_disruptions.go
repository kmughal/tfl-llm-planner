package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func GetSNCFDisruptionsTool() mcp.Tool {
	return mcp.NewTool(
		"get_sncf_disruptions",
		mcp.WithDescription("Get current disruptions and service alerts on the SNCF French rail network."),
	)
}

func HandleGetSNCFDisruptions(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := client.GetDisruptions(15)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.Disruptions) == 0 {
			return mcp.NewToolResultText("No active disruptions on the SNCF network."), nil
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "Active SNCF disruptions (%d):\n\n", len(result.Disruptions))

		for _, d := range result.Disruptions {
			icon := "⚠"
			if d.Severity.Effect == "NO_SERVICE" {
				icon = "🚫"
			}

			fmt.Fprintf(&sb, "%s %s\n", icon, d.Severity.Name)

			if len(d.ImpactedObjects) > 0 {
				fmt.Fprintf(&sb, "  Affects: %s\n", d.ImpactedObjects[0].PtObject.Name)
			}
			if len(d.Messages) > 0 {
				fmt.Fprintf(&sb, "  %s\n", d.Messages[0].Text)
			}
			if len(d.ApplicationPeriods) > 0 {
				p := d.ApplicationPeriods[0]
				fmt.Fprintf(&sb, "  Period: %s → %s\n",
					formatSNCFTime(p.Begin),
					formatSNCFTime(p.End),
				)
			}
			fmt.Fprintln(&sb)
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}
