package sncf

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

const baseURL = "https://api.sncf.com/v1/coverage/sncf"

type Client struct {
	http   *http.Client
	apiKey string
}

func NewClient(apiKey string) *Client {
	return &Client{
		http:   &http.Client{Timeout: 15 * time.Second},
		apiKey: apiKey,
	}
}

func (c *Client) get(path string, params url.Values) (*http.Response, error) {
	u := fmt.Sprintf("%s%s?%s", baseURL, path, params.Encode())
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(c.apiKey, "")
	return c.http.Do(req)
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

	resp, err := c.get("/places", params)
	if err != nil {
		return nil, fmt.Errorf("sncf request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sncf returned %d for place search %q", resp.StatusCode, query)
	}

	var result PlacesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
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

	resp, err := c.get("/journeys", params)
	if err != nil {
		return nil, fmt.Errorf("sncf request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sncf returned %d for journey %s→%s", resp.StatusCode, fromID, toID)
	}

	var result JourneysResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode journeys: %w", err)
	}
	fmt.Printf("Result from Journey: %+v\n", result)
	return &result, nil
}

// ── Disruptions ──────────────────────────────────────────────────────────────

type DisruptionsResponse struct {
	Disruptions []Disruption `json:"disruptions"`
}

type Disruption struct {
	ID                 string           `json:"id"`
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

// GetDisruptions returns active disruptions on the SNCF network.
func (c *Client) GetDisruptions(count int) (*DisruptionsResponse, error) {
	params := url.Values{}
	params.Set("count", fmt.Sprintf("%d", count))

	resp, err := c.get("/disruptions", params)
	if err != nil {
		return nil, fmt.Errorf("sncf request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sncf returned %d for disruptions", resp.StatusCode)
	}

	var result DisruptionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode disruptions: %w", err)
	}
	fmt.Println("Result from Disruptions: %+v\n", result)
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

	resp, err := c.get(fmt.Sprintf("/stop_areas/%s/departures", stopAreaID), params)
	if err != nil {
		return nil, fmt.Errorf("sncf request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sncf returned %d for departures at %s", resp.StatusCode, stopAreaID)
	}

	var result DeparturesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode departures: %w", err)
	}
	fmt.Printf("Result from Departures: %+v\n", result)
	return &result, nil
}
