package tools

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/tfl"
)

func GetBusArrivalsTool() mcp.Tool {
	return mcp.NewTool(
		"get_bus_arrivals",
		mcp.WithDescription(`Get live bus arrivals via the TfL Countdown API.

Provide at least one of: stop_name, stop_code, or line_id.
  - stop_name alone  → look up the stop by name, return all buses due there
  - stop_code alone  → all buses at that NaPTAN stop code
  - line_id alone    → all upcoming arrivals for that route across London
  - stop_name + line_id → that specific route at that named stop
  - stop_code + line_id → that specific route at that stop code

Use when the user asks:
  - "Buses at Brisbane Road" / "Next bus at Oxford Street"
  - "When is the 169?" / "Next 169 bus" / "Live arrivals for bus 169"
  - "Bus arrivals at stop 490009264W"
  - "Next 169 at Brisbane Road"

Use this tool only for live/next/due bus predictions. For browsing or listing every bus route, use get_all_bus_lines.

stop_name is a human-readable stop or street name (e.g. "Brisbane Road", "Oxford Circus").
stop_code is a NaPTAN/ATCO code found on bus stop signs (e.g. "490009264W").
line_id is the bus route number/letter (e.g. "169", "W3", "N73").
Returns arrivals sorted by estimated arrival time (soonest first).
Do NOT use for tube/rail — use get_line_status for those.
Do NOT use for "road network", "road status", "road conditions", or "TfL roads" — use get_tfl_roads for those.`),
		mcp.WithString("stop_name",
			mcp.Description("Human-readable stop or street name, e.g. 'Brisbane Road', 'Oxford Circus'. Optional if stop_code or line_id is provided."),
		),
		mcp.WithString("stop_code",
			mcp.Description("NaPTAN bus stop code, e.g. '490009264W'. Optional if stop_name or line_id is provided."),
		),
		mcp.WithString("line_id",
			mcp.Description("Bus route number or letter, e.g. '169', 'W3', 'N73'. Optional if stop_name or stop_code is provided."),
		),
	)
}

func HandleGetBusArrivals(client *tfl.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		stopCode := strings.TrimSpace(req.GetString("stop_code", ""))
		stopName := strings.TrimSpace(req.GetString("stop_name", ""))
		lineID := strings.TrimSpace(req.GetString("line_id", ""))

		// Resolve stop name → NaPTAN code when no code was given directly.
		if stopCode == "" && stopName != "" {
			code, resolved, err := resolveStopByName(client, stopName)
			if err != nil {
				return mcp.NewToolResultError(err.Error()), nil
			}
			stopCode = code
			stopName = resolved // use canonical name from TfL
		}

		if stopCode == "" && lineID == "" {
			return mcp.NewToolResultError("provide stop_name, stop_code (e.g. '490009264W'), or line_id (e.g. '169')"), nil
		}

		data, err := client.GetBusArrivals(stopCode, lineID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("TfL Countdown API error: %v", err)), nil
		}

		if len(data.Arrivals) == 0 {
			label := displayLabel(data, stopCode, stopName, lineID)
			return mcp.NewToolResultText(fmt.Sprintf(
				"BUS_ARRIVALS_START:%s|%s|%s|0|%d\nBUS_ARRIVALS_END\n\nNo bus arrivals currently predicted for %s.",
				sanitiseBus(stopCode), sanitiseBus(lineID), sanitiseBus(label), data.ServerTimeMs, label,
			)), nil
		}

		return mcp.NewToolResultText(formatBusArrivals(data, stopCode, stopName, lineID)), nil
	}
}

// resolveStopByName searches TfL for a bus stop matching name and returns its
// NaPTAN code and canonical name. Returns an error if no bus stop is found.
func resolveStopByName(client *tfl.Client, name string) (code, resolvedName string, err error) {
	results, err := client.SearchStops(name)
	if err != nil {
		return "", "", fmt.Errorf("stop search failed: %w", err)
	}
	for _, m := range results.Matches {
		for _, mode := range m.Modes {
			if mode == "bus" {
				return m.ID, m.Name, nil
			}
		}
	}
	return "", "", fmt.Errorf("no bus stop found matching %q — try a more specific name or use a stop code from the bus stop sign", name)
}

func displayLabel(data *tfl.BusStopArrivals, stopCode, stopName, lineID string) string {
	if data.StopName != "" {
		return data.StopName
	}
	if stopName != "" {
		return stopName
	}
	if lineID != "" {
		return "bus " + lineID
	}
	return stopCode
}

// ── Formatter ─────────────────────────────────────────────────────────────────

func sanitiseBus(s string) string {
	return strings.NewReplacer("|", " ", "\n", " ", "\r", "").Replace(s)
}

func formatBusArrivals(data *tfl.BusStopArrivals, stopCode, stopName, lineID string) string {
	sort.Slice(data.Arrivals, func(i, j int) bool {
		return data.Arrivals[i].EtaMs < data.Arrivals[j].EtaMs
	})

	arrivals := data.Arrivals
	if len(arrivals) > 20 {
		arrivals = arrivals[:20]
	}

	label := displayLabel(data, stopCode, stopName, lineID)

	var sb strings.Builder
	fmt.Fprintf(&sb, "BUS_ARRIVALS_START:%s|%s|%s|%d|%d\n",
		sanitiseBus(stopCode),
		sanitiseBus(lineID),
		sanitiseBus(label),
		len(arrivals),
		data.ServerTimeMs,
	)
	for _, a := range arrivals {
		fmt.Fprintf(&sb, "BUS:%s|%s|%d\n",
			sanitiseBus(a.LineName),
			sanitiseBus(a.StopName),
			a.EtaMs,
		)
	}
	fmt.Fprintln(&sb, "BUS_ARRIVALS_END")
	fmt.Fprintf(&sb, "\nHINT: The frontend renders BUS_ARRIVALS as a live countdown departure board. Reply with 1–2 sentences only: stop name, how many buses are due, and the soonest arrival.")
	return sb.String()
}
