package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/sncf"
)

func GetSNCFTrainTool() mcp.Tool {
	return mcp.NewTool(
		"get_sncf_train",
		mcp.WithDescription(`Look up the full stop schedule for a specific SNCF train by its train number.

Returns the complete itinerary for a TGV, TER, Intercités, or Ouigo service including:
  - Every intermediate stop with arrival and departure times
  - Final destination and origin
  - Train type and number

Use this tool when the user asks:
  - "What stops does TGV 6201 make?"
  - "Show me the schedule for train 6205"
  - "Where does the TGV 8501 stop between Paris and Marseille?"
  - "What time does train 4756 arrive at each station?"

Hints:
  - Use just the numeric part of the train number (e.g. '6201' not 'TGV 6201').
  - 'date' defaults to today — supply YYYYMMDD for a future date (e.g. '20260610').
  - TGV numbers are typically 4-5 digits; TER numbers vary by region.
  - If the train is not found for today, try tomorrow's date — some services only run on specific days.`),
		mcp.WithString("train_number",
			mcp.Required(),
			mcp.Description("Train number to look up, e.g. '6201', '8501', '4756', '3657'. Use the numeric portion only."),
		),
		mcp.WithString("date",
			mcp.Description("Date to search in YYYYMMDD format, e.g. '20260610'. Omit for today."),
		),
	)
}

func HandleGetSNCFTrain(client *sncf.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		trainNumber := req.GetString("train_number", "")
		if trainNumber == "" {
			return mcp.NewToolResultError("'train_number' is required"), nil
		}
		date := req.GetString("date", "")

		result, err := client.SearchTrainByNumber(trainNumber, date)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("SNCF API error: %v", err)), nil
		}

		if len(result.VehicleJourneys) == 0 {
			return mcp.NewToolResultText(fmt.Sprintf(
				"Train %s not found for %s. Try a different date or check the train number.",
				trainNumber, displayDate(date),
			)), nil
		}

		return mcp.NewToolResultText(formatTrainSchedule(trainNumber, result.VehicleJourneys)), nil
	}
}

func formatTrainSchedule(trainNumber string, vjs []sncf.VehicleJourney) string {
	var sb strings.Builder

	for i, vj := range vjs {
		direction := ""
		if vj.JourneyPattern != nil && vj.JourneyPattern.Route != nil && vj.JourneyPattern.Route.Direction != nil {
			direction = vj.JourneyPattern.Route.Direction.Name
		}
		if direction == "" {
			direction = vj.Headsign
		}

		fmt.Fprintf(&sb, "TRAIN_START:%s|%s|%s\n",
			sanitiseField(trainNumber),
			sanitiseField(vj.Name),
			sanitiseField(direction),
		)

		for _, st := range vj.StopTimes {
			arr := formatStopTime(st.ArrivalTime)
			dep := formatStopTime(st.DepartureTime)
			fmt.Fprintf(&sb, "STOP:%s|%s|%s\n",
				sanitiseField(st.StopPoint.Name),
				sanitiseField(arr),
				sanitiseField(dep),
			)
		}

		fmt.Fprintln(&sb, "TRAIN_END")

		if i < len(vjs)-1 {
			fmt.Fprintln(&sb)
		}
	}

	fmt.Fprintf(&sb, "\nHINT: The frontend renders TRAIN blocks as a vertical timeline. Reply with a brief narrative: origin, key intermediate stops, destination, and total journey time.")
	return sb.String()
}

// formatStopTime converts "080000" or "080500" to "08:00" / "08:05".
func formatStopTime(t string) string {
	if len(t) >= 6 {
		return t[0:2] + ":" + t[2:4]
	}
	return t
}

// displayDate returns a human-readable date for error messages.
func displayDate(date string) string {
	if date == "" {
		return "today"
	}
	if len(date) == 8 {
		return date[6:8] + "/" + date[4:6] + "/" + date[0:4]
	}
	return date
}
