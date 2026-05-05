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
		mcp.WithDescription(`Get real-time disruptions and service alerts on the SNCF French national rail network.

⚠️  SNCF ONLY. Do NOT use for Eurostar, TFL, or any UK/cross-channel query.
   - Eurostar cancellations/disruptions → use get_eurostar_dashboard
   - TFL delays/disruptions → use get_line_status or get_status_by_mode

Returns up to 15 active incidents:
  - Cancelled trains (NO_SERVICE)
  - Significant delays (SIGNIFICANT_DELAYS)
  - Reduced service / partial cancellations
  - Infrastructure issues (track works, signal failures, strikes)

Use ONLY when the user explicitly mentions SNCF, French trains, TGV, or France:
  - "Are there disruptions on SNCF today?"
  - "Is the TGV running normally?"
  - "Any delays on French trains?"
  - "Is there a strike on SNCF?"
  - "Are French trains on time?"

Cause messages are in French (e.g. "Grève" = strike, "Travaux" = track works).`),
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
		return mcp.NewToolResultText(formatDisruptionsBlock(result.Disruptions)), nil
	}
}

func countEffect(disruptions []sncf.Disruption, effect string) int {
	n := 0
	for _, d := range disruptions {
		if d.Severity.Effect == effect {
			n++
		}
	}
	return n
}

func sanitiseField(s string) string {
	return strings.NewReplacer("|", " ", "\n", " ", "\r", "").Replace(s)
}

func formatDisruptionsBlock(disruptions []sncf.Disruption) string {
	noService := countEffect(disruptions, "NO_SERVICE")
	delayed   := countEffect(disruptions, "SIGNIFICANT_DELAYS")
	reduced   := countEffect(disruptions, "REDUCED_SERVICE")
	other     := len(disruptions) - noService - delayed - reduced

	var sb strings.Builder
	fmt.Fprintf(&sb, "DISRUPTIONS_START:%d|%d|%d|%d|%d\n",
		len(disruptions), noService, delayed, reduced, other)

	for _, d := range disruptions {
		impacted := ""
		if len(d.ImpactedObjects) > 0 {
			impacted = d.ImpactedObjects[0].PtObject.Name
		}
		msg := ""
		if len(d.Messages) > 0 {
			msg = d.Messages[0].Text
			if len(msg) > 90 {
				msg = msg[:90]
			}
		}
		begin, end := "", ""
		if len(d.ApplicationPeriods) > 0 {
			begin = formatSNCFTime(d.ApplicationPeriods[0].Begin)
			end   = formatSNCFTime(d.ApplicationPeriods[0].End)
		}
		fmt.Fprintf(&sb, "DISRUPTION:%s|%s|%s|%s|%s|%s\n",
			sanitiseField(d.Severity.Effect),
			sanitiseField(d.Severity.Name),
			sanitiseField(impacted),
			sanitiseField(msg),
			sanitiseField(begin),
			sanitiseField(end),
		)
	}

	fmt.Fprintln(&sb, "DISRUPTIONS_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders DISRUPTIONS blocks as animated cards. Reply with 1 sentence: total disruptions and the most severe type only.")
	return sb.String()
}
