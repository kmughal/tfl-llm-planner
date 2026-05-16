package nationalrail

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const baseURL = "https://huxley2.azurewebsites.net"

// Known CRS codes for Eurostar connection stations.
var KnownStations = map[string]string{
	"london st pancras":       "STP",
	"st pancras":              "STP",
	"kings cross":             "KGX",
	"king's cross":            "KGX",
	"london kings cross":      "KGX",
	"london bridge":           "LBG",
	"london waterloo":         "WAT",
	"london victoria":         "VIC",
	"london paddington":       "PAD",
	"london euston":           "EUS",
	"ashford international":   "AFK",
	"ashford":                 "AFK",
	"ebbsfleet international": "EBD",
	"ebbsfleet":               "EBD",
	"stratford international": "SFA",
}

type Client struct {
	http  *http.Client
	token string
}

func NewClient(darwinToken string) *Client {
	return &Client{
		http:  &http.Client{Timeout: 15 * time.Second},
		token: darwinToken,
	}
}

type DeparturesResponse struct {
	LocationName  string         `json:"locationName"`
	CRS           string         `json:"crs"`
	GeneratedAt   string         `json:"generatedAt"`
	TrainServices []TrainService `json:"trainServices"`
}

// TrainService uses full datetime strings as returned by /staffdepartures.
// std/etd format: "2026-05-16T14:31:00" — zero datetime "0001-01-01T00:00:00" means not specified.
type TrainService struct {
	STD          string        `json:"std"`
	ETD          string        `json:"etd"`
	ETDSpecified bool          `json:"etdSpecified"`
	Platform     string        `json:"platform"`
	Operator     string        `json:"operator"`
	OperatorCode string        `json:"operatorCode"`
	Destination  []Destination `json:"destination"`
	IsCancelled  bool          `json:"isCancelled"`
}

type Destination struct {
	LocationName string `json:"locationName"`
	CRS          string `json:"crs"`
	Via          string `json:"via"`
}

const dtLayout = "2006-01-02T15:04:05"

// FormatHHMM extracts HH:MM from a datetime string like "2026-05-16T14:31:00".
func FormatHHMM(dt string) string {
	t, err := time.Parse(dtLayout, dt)
	if err != nil || t.Year() < 2000 {
		return ""
	}
	return t.Format("15:04")
}

// DelayMins returns the delay in minutes between two datetime strings.
func DelayMins(std, etd string) int {
	s, err1 := time.Parse(dtLayout, std)
	e, err2 := time.Parse(dtLayout, etd)
	if err1 != nil || err2 != nil || e.Year() < 2000 {
		return 0
	}
	mins := int(e.Sub(s).Minutes())
	if mins < 0 {
		return 0
	}
	return mins
}

func (c *Client) GetDepartures(crs string, count int) (*DeparturesResponse, error) {
	// /staffdepartures works; /departures returns HTTP 500 on the public instance.
	// Huxley2's public instance uses its own Darwin token internally — external tokens
	// via query param are not supported, so we use anonymous access.
	_ = c.token // reserved for a future direct SOAP implementation
	u := fmt.Sprintf("%s/staffdepartures/%s/%d", baseURL, crs, count)
	resp, err := c.http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("national rail departures: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("huxley2 returned %d", resp.StatusCode)
	}

	var result DeparturesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result, nil
}

// SampleDepartures returns static demo data shaped like a real response.
// Used as a fallback when the Huxley2 proxy is unavailable.
func SampleDepartures(crs string) *DeparturesResponse {
	today := "2026-05-16"
	return &DeparturesResponse{
		LocationName: crs,
		CRS:          crs,
		TrainServices: []TrainService{
			{
				STD: today + "T15:00:00", ETD: today + "T15:00:00", ETDSpecified: true,
				Platform: "1", Operator: "Thameslink",
				Destination: []Destination{{LocationName: "Brighton", CRS: "BTN"}},
			},
			{
				STD: today + "T15:12:00", ETD: today + "T15:17:00", ETDSpecified: true,
				Platform: "4", Operator: "East Midlands Railway",
				Destination: []Destination{{LocationName: "Sheffield", CRS: "SHF"}},
			},
			{
				STD: today + "T15:18:00", ETD: today + "T15:18:00", ETDSpecified: true,
				Platform: "A", Operator: "Thameslink",
				Destination: []Destination{{LocationName: "Cambridge", CRS: "CBG"}},
			},
			{
				STD: today + "T15:30:00", ETD: today + "T15:30:00", ETDSpecified: true,
				Platform: "3", Operator: "LNER",
				Destination: []Destination{{LocationName: "Edinburgh", CRS: "EDB"}},
			},
			{
				STD: today + "T15:45:00", ETD: "0001-01-01T00:00:00", ETDSpecified: false,
				Platform: "2", Operator: "East Midlands Railway",
				Destination: []Destination{{LocationName: "Nottingham", CRS: "NOT"}},
				IsCancelled: true,
			},
		},
	}
}
