package sotenabler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	sotTokenURL = "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token"
	sotBaseURL  = "https://gateway.dm.eurostar.com/startontime-enabler"
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

type oauthResp struct {
	AccessToken string      `json:"access_token"`
	ExpiresIn   json.Number `json:"expires_in"`
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
	resp, err := c.http.Post(sotTokenURL, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("sot oauth: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sot oauth %d: %s", resp.StatusCode, string(body))
	}
	var t oauthResp
	if err := json.Unmarshal(body, &t); err != nil {
		return "", fmt.Errorf("sot decode token: %w", err)
	}
	expiresIn, _ := t.ExpiresIn.Int64()
	if expiresIn <= 0 {
		expiresIn = 7200
	}
	c.token = t.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(expiresIn-60) * time.Second)
	return c.token, nil
}

func (c *Client) get(path string) ([]byte, error) {
	tok, err := c.bearerToken()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodGet, sotBaseURL+path, nil)
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
		return nil, fmt.Errorf("sot read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sot %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// Activity represents a crew assignment for a service on a given operational date.
type Activity struct {
	CrewType          string `json:"crewType"`
	CrewID            string `json:"crewId"`
	ServiceCode       string `json:"serviceCode"`
	Origin            string `json:"origin"`
	Destination       string `json:"destination"`
	DepartureDatetime string `json:"departureDatetime"`
	ArrivalDatetime   string `json:"arrivalDatetime"`
}

// Agent represents a crew member's profile.
type Agent struct {
	EmployeeID string `json:"employee_id"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Phone      string `json:"phone"`
	HomeDepot  string `json:"home_depot"`
}

// GetActivities returns all crew activities for an operational date (YYYY-MM-DD).
func (c *Client) GetActivities(date string) ([]Activity, error) {
	body, err := c.get("/v1/activities?operationalDate=" + date)
	if err != nil {
		return nil, err
	}
	var acts []Activity
	return acts, json.Unmarshal(body, &acts)
}

// GetAgents returns crew agent details for the given employee IDs.
func (c *Client) GetAgents(employeeIDs []string) ([]Agent, error) {
	if len(employeeIDs) == 0 {
		return nil, nil
	}
	body, err := c.get("/v1/agents?employeeIds=" + strings.Join(employeeIDs, ","))
	if err != nil {
		return nil, err
	}
	var agents []Agent
	return agents, json.Unmarshal(body, &agents)
}
