package euromap

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// planIDRe accepts only YYYYMMDD-digits format to prevent path traversal.
var planIDRe = regexp.MustCompile(`^\d{8}-\d+$`)

const (
	tokenURL = "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token"
	apiBase  = "https://gateway.dm.eurostar.com/euromap-enabler"
)

type Client struct {
	http         *http.Client
	clientID     string
	clientSecret string
	mu           sync.Mutex
	token        string
	tokenExpiry  time.Time
}

func NewClient(clientID, clientSecret string) *Client {
	return &Client{
		http:         &http.Client{Timeout: 15 * time.Second},
		clientID:     clientID,
		clientSecret: clientSecret,
	}
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

type oauthResp struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   string `json:"expires_in"`
}

func (c *Client) bearerToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.tokenExpiry) {
		return c.token, nil
	}
	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	}
	resp, err := c.http.Post(tokenURL, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("oauth token: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth %d: %s", resp.StatusCode, string(body))
	}
	var t oauthResp
	if err := json.Unmarshal(body, &t); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	expiresIn, _ := strconv.Atoi(t.ExpiresIn)
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	c.token = t.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(expiresIn-30) * time.Second)
	return c.token, nil
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

func (c *Client) get(path string, params url.Values) ([]byte, error) {
	tok, err := c.bearerToken()
	if err != nil {
		return nil, err
	}
	u := apiBase + path
	if len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("euromap %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// ── Plans ─────────────────────────────────────────────────────────────────────

type PlansResponse []Plan

type Plan struct {
	Range             string    `json:"range"`
	Status            string    `json:"status"`
	PlanID            string    `json:"planID"`
	PlanType          string    `json:"planType"`
	ServiceCode       string    `json:"serviceCode"`
	DepartureDatetime string    `json:"departureDateTime"`
	ArrivalDatetime   string    `json:"arrivalDateTime"`
	Stations          []Station `json:"stations"`
}

// Latitude and Longitude are strings in the /plans API.
type Station struct {
	SequenceNumber    int    `json:"sequenceNumber"`
	StopType          string `json:"stopType"`
	RameNumber        string `json:"rameNumber"`
	Country           string `json:"country"`
	RRCode            string `json:"rrCode"`
	ShortCode         string `json:"shortCode"`
	Latitude          string `json:"latitude"`
	Longitude         string `json:"longitude"`
	DepartureDatetime string `json:"departureDateTime,omitempty"`
	ArrivalDatetime   string `json:"arrivalDateTime,omitempty"`
}

// GetPlanByID fetches a single commercial plan by its ID (e.g. "20250519-9409").
func (c *Client) GetPlanByID(planID string) (*Plan, error) {
	if !planIDRe.MatchString(planID) {
		return nil, fmt.Errorf("invalid planID format: %q", planID)
	}
	body, err := c.get("/v1/plans/"+planID, nil)
	if err != nil {
		return nil, fmt.Errorf("plan by id: %w", err)
	}
	var result Plan
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode plan: %w", err)
	}
	return &result, nil
}

func (c *Client) GetPlans(fromDateTime, ranges string) (PlansResponse, error) {
	params := url.Values{}
	params.Set("fromDateTime", fromDateTime)
	params.Set("range", ranges)
	body, err := c.get("/v1/plans", params)
	if err != nil {
		return nil, fmt.Errorf("plans: %w", err)
	}
	var result PlansResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode plans: %w", err)
	}
	return result, nil
}

// ── Technical Plans ───────────────────────────────────────────────────────────

type TechnicalPlansResponse []TechnicalPlan

type TechnicalPlan struct {
	Range         string         `json:"range"`
	Status        string         `json:"status"`
	PlanID        string         `json:"planID"`
	PlanType      string         `json:"planType"`
	ServiceCode   string         `json:"serviceCode"`
	TravelDate    string         `json:"travelDate"`
	Origin        TechEndpoint   `json:"origin"`
	Destination   TechEndpoint   `json:"destination"`
	PassagePoints []PassagePoint `json:"passagePoints"`
}

type TechEndpoint struct {
	Country   string `json:"country"`
	RRCode    string `json:"rrCode"`
	ShortCode string `json:"shortCode"`
}

type PassagePoint struct {
	ID             string     `json:"id"`
	StopType       string     `json:"stopType"`
	SequenceNumber int        `json:"sequenceNumber"`
	Position       string     `json:"position"`
	RameNumber     string     `json:"rameNumber"`
	DepartureTime  *TimeEntry `json:"departureTime,omitempty"`
	ArrivalTime    *TimeEntry `json:"arrivalTime,omitempty"`
	Place          Place      `json:"place"`
}

type TimeEntry struct {
	TheoreticalDateTime string `json:"theoreticalDateTime"`
}

type Place struct {
	Country     string            `json:"country"`
	Latitude    float64           `json:"latitude"`
	Longitude   float64           `json:"longitude"`
	StationInfo StationInfo       `json:"stationInfo"`
	Description map[string]string `json:"description"`
}

type StationInfo struct {
	ShortCode string `json:"shortCode"`
	RRCode    string `json:"rrCode"`
}

func (c *Client) GetTechnicalPlans(fromDateTime, ranges string) (TechnicalPlansResponse, error) {
	params := url.Values{}
	params.Set("fromDateTime", fromDateTime)
	params.Set("range", ranges)
	body, err := c.get("/v1/technical-plans", params)
	if err != nil {
		return nil, fmt.Errorf("technical-plans: %w", err)
	}
	var result TechnicalPlansResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode technical-plans: %w", err)
	}
	return result, nil
}

// GetTechnicalPlanByID fetches a single technical plan by its ID (e.g. "20250519-9409").
func (c *Client) GetTechnicalPlanByID(planID string) (*TechnicalPlan, error) {
	if !planIDRe.MatchString(planID) {
		return nil, fmt.Errorf("invalid planID format: %q", planID)
	}
	body, err := c.get("/v1/technical-plans/"+planID, nil)
	if err != nil {
		return nil, fmt.Errorf("technical plan by id: %w", err)
	}
	var result TechnicalPlan
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode technical plan: %w", err)
	}
	return &result, nil
}
