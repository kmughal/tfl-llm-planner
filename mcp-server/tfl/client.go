package tfl

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const baseURL = "https://api.tfl.gov.uk"

type Client struct {
	http    *http.Client
	appKey  string // optional — higher rate limits
	saveDir string
}

func NewClient(appKey string) *Client {
	dir := resolveResponsesDir()
	_ = os.MkdirAll(dir, 0755)
	return &Client{
		http:    &http.Client{Timeout: 15 * time.Second},
		appKey:  appKey,
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
	if c.appKey != "" {
		params.Set("app_key", c.appKey)
	}
	u := fmt.Sprintf("%s%s?%s", baseURL, path, params.Encode())

	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	// TFL blocks Go's default user-agent; send a browser-like one
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; tfl-llm-sample/1.0)")

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
		return nil, fmt.Errorf("tfl returned %d for %s", resp.StatusCode, path)
	}

	return body, nil
}

func (c *Client) saveJSON(name string, data []byte) {
	ts := time.Now().Format("20060102T150405")
	fname := filepath.Join(c.saveDir, fmt.Sprintf("tfl_%s_%s.json", name, ts))
	var pretty []byte
	var tmp any
	if json.Unmarshal(data, &tmp) == nil {
		pretty, _ = json.MarshalIndent(tmp, "", "  ")
	}
	if pretty == nil {
		pretty = data
	}
	if err := os.WriteFile(fname, pretty, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not save tfl response: %v\n", err)
	}
}

func requestErr(err error) error { return fmt.Errorf("tfl request failed: %w", err) }

// pathJoin escapes each comma-separated segment individually and rejoins with
// literal commas. TFL path params like "central,victoria" must keep commas
// unencoded; url.PathEscape would turn them into %2C which TFL rejects (403).
func pathJoin(s string) string {
	parts := strings.Split(s, ",")
	for i, p := range parts {
		parts[i] = url.PathEscape(strings.TrimSpace(p))
	}
	return strings.Join(parts, ",")
}

// ── Journey types ────────────────────────────────────────────────────────────

type JourneyResults struct {
	Journeys []Journey `json:"journeys"`
}

type Journey struct {
	StartDateTime   string `json:"startDateTime"`
	ArrivalDateTime string `json:"arrivalDateTime"`
	Duration        int    `json:"duration"`
	Legs            []Leg  `json:"legs"`
	Fare            *Fare  `json:"fare,omitempty"`
}

type Leg struct {
	DepartureTime  string       `json:"departureTime"`
	ArrivalTime    string       `json:"arrivalTime"`
	Duration       int          `json:"duration"`
	Instruction    Instruction  `json:"instruction"`
	DeparturePoint StopPoint    `json:"departurePoint"`
	ArrivalPoint   StopPoint    `json:"arrivalPoint"`
	Mode           Mode         `json:"mode"`
	Disruptions    []Disruption `json:"disruptions"`
}

type Instruction struct {
	Summary  string `json:"summary"`
	Detailed string `json:"detailed"`
}

type StopPoint struct {
	CommonName string  `json:"commonName"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
}

type Mode struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Disruption struct {
	Category    string `json:"category"`
	Description string `json:"description"`
}

type Fare struct {
	TotalCost int `json:"totalCost"` // pence
}

// ── Line status types ────────────────────────────────────────────────────────

type LineStatus struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	LineStatuses []StatusDetail `json:"lineStatuses"`
}

type StatusDetail struct {
	StatusSeverity            int    `json:"statusSeverity"`
	StatusSeverityDescription string `json:"statusSeverityDescription"`
	Reason                    string `json:"reason,omitempty"`
}

// ── Stop point types ─────────────────────────────────────────────────────────

type StopSearchResult struct {
	Matches []StopMatch `json:"matches"`
}

type StopMatch struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Lat   float64  `json:"lat"`
	Lon   float64  `json:"lon"`
	Modes []string `json:"modes"`
}

// ── API methods ──────────────────────────────────────────────────────────────

// PlanJourney queries /Journey/JourneyResults/{from}/to/{to}.
// time24h is optional (HHmm, e.g. "0900"); modes is optional comma-separated list.
func (c *Client) PlanJourney(from, to, time24h, modes, preference string) (*JourneyResults, error) {
	path := fmt.Sprintf("/Journey/JourneyResults/%s/to/%s",
		url.PathEscape(from), url.PathEscape(to))

	params := url.Values{}
	if time24h != "" {
		params.Set("time", time24h)
		params.Set("timeIs", "Departing")
	}
	if modes != "" {
		params.Set("mode", modes)
	}
	if preference != "" {
		params.Set("journeyPreference", preference)
	}

	body, err := c.get(path, params)
	if err != nil {
		return nil, requestErr(err)
	}
	c.saveJSON("journey", body)

	var result JourneyResults
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode journey response: %w", err)
	}
	return &result, nil
}

// GetLineStatus returns status for one or more lines (comma-separated IDs, e.g. "central,victoria").
func (c *Client) GetLineStatus(lines string) ([]LineStatus, error) {
	path := fmt.Sprintf("/Line/%s/Status", pathJoin(lines))

	body, err := c.get(path, url.Values{})
	if err != nil {
		return nil, requestErr(err)
	}
	c.saveJSON("line_status", body)

	var result []LineStatus
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode line status: %w", err)
	}
	return result, nil
}

// GetLineStatusByMode returns status for all lines of given transport modes
// (comma-separated, e.g. "tube,dlr"). Maps to /Line/Mode/{modes}/Status.
func (c *Client) GetLineStatusByMode(modes string) ([]LineStatus, error) {
	path := fmt.Sprintf("/Line/Mode/%s/Status", pathJoin(modes))

	body, err := c.get(path, url.Values{})
	if err != nil {
		return nil, requestErr(err)
	}
	c.saveJSON("line_status_by_mode", body)

	var result []LineStatus
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode mode status: %w", err)
	}
	return result, nil
}

// SearchStops searches for stop points by name or naptan ID.
func (c *Client) SearchStops(query string) (*StopSearchResult, error) {
	params := url.Values{}
	params.Set("query", query)
	// limit results and include only common modes
	modes := []string{"tube", "bus", "dlr", "overground", "elizabeth-line", "national-rail"}
	params.Set("modes", strings.Join(modes, ","))

	body, err := c.get("/StopPoint/Search", params)
	if err != nil {
		return nil, requestErr(err)
	}
	c.saveJSON("stop_search", body)

	var result StopSearchResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode stop search: %w", err)
	}
	return &result, nil
}
