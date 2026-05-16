package weather

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Known Eurostar-route cities with their coordinates.
var Cities = map[string][2]float64{
	"london":   {51.5074, -0.1278},
	"paris":    {48.8566, 2.3522},
	"brussels": {50.8503, 4.3517},
	"lille":    {50.6292, 3.0573},
}

type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{http: &http.Client{Timeout: 10 * time.Second}}
}

type Response struct {
	Current  CurrentWeather `json:"current"`
	Hourly   HourlyWeather  `json:"hourly"`
	Timezone string         `json:"timezone"`
}

type CurrentWeather struct {
	Time                string  `json:"time"`
	Temperature2m       float64 `json:"temperature_2m"`
	ApparentTemperature float64 `json:"apparent_temperature"`
	RelativeHumidity2m  int     `json:"relative_humidity_2m"`
	WindSpeed10m        float64 `json:"wind_speed_10m"`
	WeatherCode         int     `json:"weather_code"`
}

type HourlyWeather struct {
	Time          []string  `json:"time"`
	Temperature2m []float64 `json:"temperature_2m"`
	WeatherCode   []int     `json:"weather_code"`
}

func (c *Client) GetWeather(lat, lon float64) (*Response, error) {
	params := url.Values{}
	params.Set("latitude", fmt.Sprintf("%.4f", lat))
	params.Set("longitude", fmt.Sprintf("%.4f", lon))
	params.Set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code")
	params.Set("hourly", "temperature_2m,weather_code")
	params.Set("forecast_days", "1")
	params.Set("timezone", "auto")
	params.Set("wind_speed_unit", "mph")

	u := "https://api.open-meteo.com/v1/forecast?" + params.Encode()
	resp, err := c.http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("open-meteo: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("open-meteo returned %d: %s", resp.StatusCode, string(body))
	}

	var result Response
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result, nil
}

func WMODescription(code int) string {
	switch {
	case code == 0:
		return "Clear sky"
	case code <= 3:
		return "Partly cloudy"
	case code <= 48:
		return "Fog"
	case code <= 55:
		return "Drizzle"
	case code <= 65:
		return "Rain"
	case code <= 75:
		return "Snow"
	case code == 77:
		return "Snow grains"
	case code <= 82:
		return "Showers"
	case code <= 86:
		return "Snow showers"
	case code >= 95:
		return "Thunderstorm"
	default:
		return "Unknown"
	}
}
