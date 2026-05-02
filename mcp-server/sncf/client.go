package sncf

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

const baseURL = "https://api.sncf.com/v1/coverage/sncf"

type Client struct {
	http    *http.Client
	apiKey  string
	saveDir string
}

func NewClient(apiKey string) *Client {
	dir := resolveResponsesDir()
	_ = os.MkdirAll(dir, 0755)
	return &Client{
		http:    &http.Client{Timeout: 15 * time.Second},
		apiKey:  apiKey,
		saveDir: dir,
	}
}

func resolveResponsesDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "responses"
	}
	return filepath.Join(filepath.Dir(exe), "responses")
}

func (c *Client) get(path string, params url.Values) ([]byte, error) {
	u := fmt.Sprintf("%s%s?%s", baseURL, path, params.Encode())
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(c.apiKey, "")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sncf returned %d for %s", resp.StatusCode, path)
	}

	return body, nil
}

func (c *Client) saveJSON(name string, data []byte) {
	ts := time.Now().Format("20060102T150405")
	fname := filepath.Join(c.saveDir, fmt.Sprintf("sncf_%s_%s.json", name, ts))
	var pretty []byte
	var tmp any
	if json.Unmarshal(data, &tmp) == nil {
		pretty, _ = json.MarshalIndent(tmp, "", "  ")
	}
	if pretty == nil {
		pretty = data
	}
	if err := os.WriteFile(fname, pretty, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not save sncf response: %v\n", err)
	}
}

// ── Places ───────────────────────────────────────────────────────────────────

type PlacesResponse struct {
	Places []Place `json:"places"`
}

type Place struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	EmbeddedType string   `json:"embedded_type"`
	StopArea     StopArea `json:"stop_area"`
}

type StopArea struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Coord Coord  `json:"coord"`
}

type Coord struct {
	Lat string `json:"lat"`
	Lon string `json:"lon"`
}

// SearchPlaces returns stop areas matching the query string.
func (c *Client) SearchPlaces(query string) ([]Place, error) {
	params := url.Values{}
	params.Set("q", query)
	params.Add("type[]", "stop_area")
	params.Set("count", "5")

	body, err := c.get("/places", params)
	if err != nil {
		return nil, fmt.Errorf("sncf places: %w", err)
	}
	c.saveJSON("places", body)

	var result PlacesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode places: %w", err)
	}
	return result.Places, nil
}

// ── Journeys ─────────────────────────────────────────────────────────────────

type JourneysResponse struct {
	Journeys []Journey `json:"journeys"`
}

type Journey struct {
	Duration          int       `json:"duration"` // seconds
	DepartureDatetime string    `json:"departure_date_time"`
	ArrivalDatetime   string    `json:"arrival_date_time"`
	NbTransfers       int       `json:"nb_transfers"`
	Sections          []Section `json:"sections"`
}

type Section struct {
	Type              string       `json:"type"`
	Duration          int          `json:"duration"` // seconds
	DepartureDatetime string       `json:"departure_date_time"`
	ArrivalDatetime   string       `json:"arrival_date_time"`
	From              SectionEnd   `json:"from"`
	To                SectionEnd   `json:"to"`
	DisplayInfo       *DisplayInfo `json:"display_informations,omitempty"`
}

type SectionEnd struct {
	Name      string `json:"name"`
	StopPoint *struct {
		Name string `json:"name"`
	} `json:"stop_point,omitempty"`
}

type DisplayInfo struct {
	CommercialMode string `json:"commercial_mode"`
	Label          string `json:"label"`
	Direction      string `json:"direction"`
	Color          string `json:"color"`
}

// PlanJourney returns up to count journeys from one place ID to another.
func (c *Client) PlanJourney(fromID, toID, datetime string, count int) (*JourneysResponse, error) {
	params := url.Values{}
	params.Set("from", fromID)
	params.Set("to", toID)
	if datetime != "" {
		params.Set("datetime", datetime)
	}
	params.Set("count", fmt.Sprintf("%d", count))
	params.Set("datetime_represents", "departure")

	body, err := c.get("/journeys", params)
	if err != nil {
		return nil, fmt.Errorf("sncf journeys: %w", err)
	}
	c.saveJSON("journeys", body)

	var result JourneysResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode journeys: %w", err)
	}
	return &result, nil
}

// ── Disruptions ──────────────────────────────────────────────────────────────

type DisruptionsResponse struct {
	Disruptions []Disruption `json:"disruptions"`
}

type Disruption struct {
	ID                 string           `json:"id"`
	Status             string           `json:"status"` // "active", "past", "future"
	Severity           Severity         `json:"severity"`
	Messages           []DisruptionMsg  `json:"messages"`
	ImpactedObjects    []ImpactedObject `json:"impacted_objects"`
	ApplicationPeriods []Period         `json:"application_periods"`
}

type Severity struct {
	Name   string `json:"name"`
	Effect string `json:"effect"`
}

type DisruptionMsg struct {
	Text string `json:"text"`
}

type ImpactedObject struct {
	PtObject struct {
		Name string `json:"name"`
	} `json:"pt_object"`
}

type Period struct {
	Begin string `json:"begin"`
	End   string `json:"end"`
}

// GetDisruptions returns currently active disruptions on the SNCF network.
func (c *Client) GetDisruptions(count int) (*DisruptionsResponse, error) {
	now := time.Now().UTC().Format("20060102T150405")
	params := url.Values{}
	params.Set("count", fmt.Sprintf("%d", count))
	params.Set("since", now)
	params.Set("until", now)

	body, err := c.get("/disruptions", params)
	if err != nil {
		return nil, fmt.Errorf("sncf disruptions: %w", err)
	}
	c.saveJSON("disruptions", body)

	var result DisruptionsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode disruptions: %w", err)
	}
	return &result, nil
}

// ── Departures ───────────────────────────────────────────────────────────────

type DeparturesResponse struct {
	Departures []Departure `json:"departures"`
}

type Departure struct {
	StopDateTime StopDateTime `json:"stop_date_time"`
	DisplayInfo  DisplayInfo  `json:"display_informations"`
	StopPoint    struct {
		Name string `json:"name"`
	} `json:"stop_point"`
}

type StopDateTime struct {
	DepartureDateTime string `json:"departure_date_time"`
	BaseDateTime      string `json:"base_departure_date_time"`
}

// GetDepartures returns next departures from a stop area.
func (c *Client) GetDepartures(stopAreaID string, count int) (*DeparturesResponse, error) {
	params := url.Values{}
	params.Set("count", fmt.Sprintf("%d", count))

	body, err := c.get(fmt.Sprintf("/stop_areas/%s/departures", stopAreaID), params)
	if err != nil {
		return nil, fmt.Errorf("sncf departures: %w", err)
	}
	c.saveJSON("departures", body)

	var result DeparturesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode departures: %w", err)
	}
	return &result, nil
}

// ── Arrivals ─────────────────────────────────────────────────────────────────

type ArrivalsResponse struct {
	Arrivals []Arrival `json:"arrivals"`
}

type Arrival struct {
	StopDateTime ArrivalStopDT `json:"stop_date_time"`
	DisplayInfo  DisplayInfo   `json:"display_informations"`
	StopPoint    struct {
		Name string `json:"name"`
	} `json:"stop_point"`
}

type ArrivalStopDT struct {
	ArrivalDateTime     string `json:"arrival_date_time"`
	BaseArrivalDateTime string `json:"base_arrival_date_time"`
}

// GetArrivals returns next arrivals at a stop area.
func (c *Client) GetArrivals(stopAreaID string, count int) (*ArrivalsResponse, error) {
	params := url.Values{}
	params.Set("count", fmt.Sprintf("%d", count))

	body, err := c.get(fmt.Sprintf("/stop_areas/%s/arrivals", stopAreaID), params)
	if err != nil {
		return nil, fmt.Errorf("sncf arrivals: %w", err)
	}
	c.saveJSON("arrivals", body)

	var result ArrivalsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode arrivals: %w", err)
	}
	return &result, nil
}

// ── Vehicle Journeys ──────────────────────────────────────────────────────────

type PtObjectsResponse struct {
	PtObjects []PtObject `json:"pt_objects"`
}

type PtObject struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	EmbeddedType string `json:"embedded_type"`
}

type VehicleJourneysResponse struct {
	VehicleJourneys []VehicleJourney `json:"vehicle_journeys"`
}

type VehicleJourney struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Headsign       string      `json:"headsign"`
	JourneyPattern *VJPattern  `json:"journey_pattern,omitempty"`
	StopTimes      []StopTime  `json:"stop_times"`
}

type VJPattern struct {
	Route *VJRoute `json:"route,omitempty"`
}

type VJRoute struct {
	Direction *struct {
		Name string `json:"name"`
	} `json:"direction,omitempty"`
}

type StopTime struct {
	DepartureTime string      `json:"departure_time"` // "HHMMSS"
	ArrivalTime   string      `json:"arrival_time"`   // "HHMMSS"
	StopPoint     VJStopPoint `json:"stop_point"`
}

type VJStopPoint struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// SearchTrainByNumber finds a vehicle journey by train number for a given date.
// date format: YYYYMMDD — empty defaults to today.
// Uses two strategies: headsign filter first, then pt_objects lookup.
func (c *Client) SearchTrainByNumber(trainNumber, date string) (*VehicleJourneysResponse, error) {
	if date == "" {
		date = time.Now().UTC().Format("20060102")
	}
	since := date + "T000000"
	until := date + "T235959"

	// Strategy 1: vehicle_journeys with headsign filter (most direct)
	params := url.Values{}
	params.Set("headsign", trainNumber)
	params.Set("since", since)
	params.Set("until", until)
	params.Set("count", "3")
	params.Set("depth", "2")

	body, err := c.get("/vehicle_journeys", params)
	if err == nil {
		var result VehicleJourneysResponse
		if json.Unmarshal(body, &result) == nil && len(result.VehicleJourneys) > 0 {
			c.saveJSON("vehicle_journey", body)
			return &result, nil
		}
	}

	// Strategy 2: pt_objects search → trip vehicle journeys
	ptParams := url.Values{}
	ptParams.Set("q", trainNumber)
	ptParams.Add("type[]", "trip")
	ptParams.Set("count", "5")

	ptBody, ptErr := c.get("/pt_objects", ptParams)
	if ptErr != nil {
		if err != nil {
			return nil, fmt.Errorf("sncf train search: %w", err)
		}
		return nil, fmt.Errorf("sncf train search (pt_objects): %w", ptErr)
	}

	var ptResult PtObjectsResponse
	if jsonErr := json.Unmarshal(ptBody, &ptResult); jsonErr != nil || len(ptResult.PtObjects) == 0 {
		return &VehicleJourneysResponse{}, nil
	}

	tripID := ptResult.PtObjects[0].ID
	vjParams := url.Values{}
	vjParams.Set("count", "1")
	vjParams.Set("since", since)
	vjParams.Set("until", until)
	vjParams.Set("depth", "2")

	vjBody, vjErr := c.get("/trips/"+tripID+"/vehicle_journeys", vjParams)
	if vjErr != nil {
		return &VehicleJourneysResponse{}, nil
	}
	c.saveJSON("vehicle_journey", vjBody)

	var vjResult VehicleJourneysResponse
	if jsonErr := json.Unmarshal(vjBody, &vjResult); jsonErr != nil {
		return nil, fmt.Errorf("decode vehicle_journeys: %w", jsonErr)
	}
	return &vjResult, nil
}
