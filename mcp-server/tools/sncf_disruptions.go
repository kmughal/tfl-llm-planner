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
		mcp.WithDescription(`Get real-time disruptions and service alerts currently active on the SNCF French rail network.

Returns up to 15 active incidents including:
  - Cancelled trains (NO_SERVICE)
  - Significant delays (SIGNIFICANT_DELAYS)
  - Reduced service / partial cancellations
  - Infrastructure issues (track works, signal failures, strikes)

Each disruption shows the severity, affected train or line, cause message (in French), and the active time window.

Use this tool when the user asks any of:
  - "Are there disruptions on SNCF today?"
  - "Is the TGV running normally?"
  - "Any delays on French trains?"
  - "Is there a strike on SNCF?"
  - "Are French trains on time?"

Hints:
  - This covers the entire national SNCF network: TGV, Intercités, TER, Ouigo, and substitute coaches.
  - Cause messages are in French (e.g. "Défaillance de matériel" = equipment failure, "Grève" = strike, "Travaux" = track works).
  - If no disruptions are returned, the network is running normally at this moment.
  - This tool does NOT cover Eurostar or cross-channel services — use get_euromap_plans for those.`),
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
			sb.WriteString(formatDisruption(d))
		}
		return mcp.NewToolResultText(sb.String()), nil
	}
}

func formatDisruption(d sncf.Disruption) string {
	var sb strings.Builder
	icon := "⚠"
	if d.Severity.Effect == "NO_SERVICE" {
		icon = "🚫"
	}
	fmt.Fprintf(&sb, "%s [%s] %s\n", icon, d.Status, d.Severity.Name)
	if len(d.ImpactedObjects) > 0 {
		fmt.Fprintf(&sb, "  Affects: %s\n", d.ImpactedObjects[0].PtObject.Name)
	}
	if len(d.Messages) > 0 {
		fmt.Fprintf(&sb, "  %s\n", d.Messages[0].Text)
	}
	if len(d.ApplicationPeriods) > 0 {
		p := d.ApplicationPeriods[0]
		fmt.Fprintf(&sb, "  Period: %s → %s\n", formatSNCFTime(p.Begin), formatSNCFTime(p.End))
	}
	fmt.Fprintln(&sb)
	return sb.String()
}
