package ratp

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Uses the SNCF Navitia coverage which includes RER B/D/E and Transilien at Paris stations.
// Requires SNCF_API_KEY — no separate Navitia key needed.
const baseURL = "https://api.sncf.com/v1/coverage/sncf"

// Stop area IDs verified against the SNCF Navitia API.
// The /places search endpoint returns empty results with the SNCF key so we hardcode these.
const (
	idNord        = "stop_area:SNCF:87271007"
	idLyon        = "stop_area:SNCF:87686006"
	idMontparnasse = "stop_area:SNCF:87391003"
	idSaintLazare = "stop_area:SNCF:87384008"
	idEst         = "stop_area:SNCF:87113001"
	idChatelet    = "stop_area:SNCF:87758607"
	idCDG         = "stop_area:SNCF:87001479"
)

// KnownStations maps common Paris station names (lowercase) to their SNCF stop_area IDs.
var KnownStations = map[string]string{
	"gare du nord":               idNord,
	"paris nord":                 idNord,
	"nord":                       idNord,
	"gare de lyon":               idLyon,
	"paris gare de lyon":         idLyon,
	"lyon":                       idLyon,
	"montparnasse":               idMontparnasse,
	"paris montparnasse":         idMontparnasse,
	"saint-lazare":               idSaintLazare,
	"saint lazare":               idSaintLazare,
	"paris saint-lazare":         idSaintLazare,
	"paris saint lazare":         idSaintLazare,
	"gare de l'est":              idEst,
	"gare de l est":              idEst,
	"paris est":                  idEst,
	"est":                        idEst,
	"chatelet":                   idChatelet,
	"chatelet les halles":        idChatelet,
	"châtelet":              idChatelet,
	"châtelet les halles":   idChatelet,
	"cdg":                        idCDG,
	"charles de gaulle":          idCDG,
	"aeroport charles de gaulle": idCDG,
}

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

// KeyMissing returns true when no API key has been configured.
func (c *Client) KeyMissing() bool {
	return c.apiKey == ""
}

func (c *Client) get(path string, params url.Values) ([]byte, error) {
	base, err := url.Parse(baseURL + path)
	if err != nil {
		return nil, fmt.Errorf("build url: %w", err)
	}
	base.RawQuery = params.Encode()
	req, err := http.NewRequest(http.MethodGet, base.String(), nil)
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
		return nil, fmt.Errorf("sncf api returned %d for %s", resp.StatusCode, path)
	}
	return body, nil
}

// ── Station lookup ────────────────────────────────────────────────────────────

// Place is a resolved Paris station with its SNCF stop_area ID and display name.
type Place struct {
	ID   string
	Name string
}

// ResolveStation looks up a Paris station by name from the hardcoded KnownStations map.
// The SNCF /places search API returns empty results with the SNCF key, so we use
// pre-verified stop_area IDs instead.
func ResolveStation(query string) (Place, bool) {
	key := strings.ToLower(strings.TrimSpace(query))
	id, ok := KnownStations[key]
	if !ok {
		return Place{}, false
	}
	return Place{ID: id, Name: query}, true
}

// ── Departures ───────────────────────────────────────────────────────────────

type DeparturesResponse struct {
	Departures []Departure `json:"departures"`
}

type Departure struct {
	StopDateTime StopDateTime `json:"stop_date_time"`
	DisplayInfo  DisplayInfo  `json:"display_informations"`
}

type StopDateTime struct {
	DepartureDateTime string `json:"departure_date_time"`
	BaseDateTime      string `json:"base_departure_date_time"`
}

type DisplayInfo struct {
	CommercialMode string `json:"commercial_mode"`
	Label          string `json:"label"`
	Direction      string `json:"direction"`
	Color          string `json:"color"`
	TextColor      string `json:"text_color"`
	Network        string `json:"network"`
}

func (c *Client) GetDepartures(stopAreaID string, count int) (*DeparturesResponse, error) {
	params := url.Values{}
	params.Set("count", fmt.Sprintf("%d", count))

	body, err := c.get(fmt.Sprintf("/stop_areas/%s/departures", stopAreaID), params)
	if err != nil {
		return nil, fmt.Errorf("ratp departures: %w", err)
	}

	var result DeparturesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode departures: %w", err)
	}
	return &result, nil
}
