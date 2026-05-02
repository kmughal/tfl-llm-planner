package traveler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const apiURL = "https://thapaas.thalys.com/traveler-sapi/v1/traveler-summary"

// ── API types ─────────────────────────────────────────────────────────────────

type DetailItem struct {
	Type          string `json:"_type"`
	TravelerCount int    `json:"travelerCount"`
	Count         int    `json:"count,omitempty"`
}

type ServiceClass struct {
	ServiceClass  string `json:"serviceClass"`
	TravelerCount int    `json:"travelerCount"`
}

type Coach struct {
	CoachNumber    string         `json:"coachNumber"`
	TravelerCount  int            `json:"travelerCount"`
	ServiceClasses []ServiceClass `json:"serviceClasses"`
	Details        []DetailItem   `json:"details"`
}

type Route struct {
	Origin        string  `json:"origin"`
	Destination   string  `json:"destination"`
	TravelerCount int     `json:"travelerCount"`
	Coaches       []Coach `json:"coaches"`
}

type ServiceSummary struct {
	ServiceCode   string  `json:"serviceCode"`
	TravelerCount int     `json:"travelerCount"`
	Routes        []Route `json:"routes"`
}

type Response []ServiceSummary

// ── Cache entry ───────────────────────────────────────────────────────────────

type cacheEntry struct {
	data      Response
	fetchedAt time.Time
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

// ── Client ────────────────────────────────────────────────────────────────────

type Client struct {
	http       *http.Client
	clientID   string
	consumerID string
	mu         sync.RWMutex
	cache      map[string]cacheEntry
}

func NewClient(clientID, consumerID string) *Client {
	return &Client{
		http:       &http.Client{Timeout: 15 * time.Second},
		clientID:   clientID,
		consumerID: consumerID,
		cache:      make(map[string]cacheEntry),
	}
}

func (c *Client) GetTravelerSummary(date string) (Response, error) {
	// Check cache — valid for the same calendar day
	c.mu.RLock()
	if entry, ok := c.cache[date]; ok && sameDay(entry.fetchedAt, time.Now()) {
		c.mu.RUnlock()
		return entry.data, nil
	}
	c.mu.RUnlock()

	req, err := http.NewRequest("GET", apiURL+"?travelDate="+date, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("client_id", c.clientID)
	req.Header.Set("consumer.client_id", c.consumerID)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from traveler API", resp.StatusCode)
	}

	var data Response
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decode error: %w", err)
	}

	c.mu.Lock()
	c.cache[date] = cacheEntry{data: data, fetchedAt: time.Now()}
	c.mu.Unlock()

	return data, nil
}
