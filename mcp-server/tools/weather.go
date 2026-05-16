package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"tfl-mcp-server/weather"
)

func GetWeatherTool() mcp.Tool {
	return mcp.NewTool(
		"get_weather",
		mcp.WithDescription(`Get current weather and today's hourly forecast for a city. No API key required.

Returns: temperature, feels-like, humidity, wind, weather condition, and 6-hour forecast.

Use this tool when the user asks:
  - "What's the weather in London today?"
  - "Will it rain in Paris?"
  - "Should I pack an umbrella for Brussels?"
  - "Is it cold in Lille?"
  - "Weather at both ends of my Eurostar trip"
  - "Weather in [city]" — any weather or conditions query

Supported cities (pass as 'city' parameter):
  - london, paris, brussels, lille

For Eurostar passengers, call twice — once for London, once for Paris or Brussels.`),
		mcp.WithString("city",
			mcp.Required(),
			mcp.Description("City name: 'london', 'paris', 'brussels', or 'lille'"),
		),
	)
}

func HandleGetWeather(client *weather.Client) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		city := strings.ToLower(strings.TrimSpace(req.GetString("city", "")))
		if city == "" {
			return mcp.NewToolResultError("'city' is required"), nil
		}

		coords, ok := weather.Cities[city]
		if !ok {
			supported := make([]string, 0, len(weather.Cities))
			for k := range weather.Cities {
				supported = append(supported, k)
			}
			return mcp.NewToolResultError(fmt.Sprintf("Unknown city %q. Supported: %s", city, strings.Join(supported, ", "))), nil
		}

		result, err := client.GetWeather(coords[0], coords[1])
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Weather API error: %v", err)), nil
		}

		return mcp.NewToolResultText(formatWeather(city, coords, result)), nil
	}
}

func formatWeather(city string, coords [2]float64, r *weather.Response) string {
	var sb strings.Builder
	cityTitle := strings.ToUpper(city[:1]) + city[1:]

	fmt.Fprintf(&sb, "WEATHER_START:%s|%.4f|%.4f\n", cityTitle, coords[0], coords[1])
	fmt.Fprintf(&sb, "CURRENT:%.1f|%.1f|%d|%.1f|%d|%s\n",
		r.Current.Temperature2m,
		r.Current.ApparentTemperature,
		r.Current.RelativeHumidity2m,
		r.Current.WindSpeed10m,
		r.Current.WeatherCode,
		weather.WMODescription(r.Current.WeatherCode),
	)

	// Emit next 6 hours of forecast from current hour onwards
	now := time.Now()
	count := 0
	for i, t := range r.Hourly.Time {
		parsed, err := time.Parse("2006-01-02T15:04", t)
		if err != nil {
			continue
		}
		if parsed.Before(now) {
			continue
		}
		if count >= 6 {
			break
		}
		fmt.Fprintf(&sb, "FORECAST:%s|%.1f|%d|%s\n",
			parsed.Format("15:04"),
			r.Hourly.Temperature2m[i],
			r.Hourly.WeatherCode[i],
			weather.WMODescription(r.Hourly.WeatherCode[i]),
		)
		count++
	}

	fmt.Fprintln(&sb, "WEATHER_END")
	fmt.Fprintf(&sb, "\nHINT: Render WEATHER blocks as a compact card. Summarise conditions in one sentence and flag anything that might affect travel (heavy rain, thunderstorms, fog).")
	return sb.String()
}
