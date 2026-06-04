package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	sotTokenURL = "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token"
	sotAPIBase  = "https://gateway.dm.eurostar.com/startontime-enabler"
)

// ── SOT OAuth client (singleton, same pattern as euromapHTTPClient) ───────────

type sotHTTPClient struct {
	hc           *http.Client
	clientID     string
	clientSecret string
	mu           sync.Mutex
	token        string
	tokenExpiry  time.Time
}

var (
	_sotOnce sync.Once
	_sot     *sotHTTPClient
)

func sotclient() *sotHTTPClient {
	_sotOnce.Do(func() {
		_sot = &sotHTTPClient{
			hc:           &http.Client{Timeout: 15 * time.Second},
			clientID:     os.Getenv("SOT_CLIENT_ID"),
			clientSecret: os.Getenv("SOT_CLIENT_SECRET"),
		}
	})
	return _sot
}

type sotTokenResp struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int64  `json:"expires_in"`
}

func (c *sotHTTPClient) bearer() (string, error) {
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
	resp, err := c.hc.Post(sotTokenURL, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("sot oauth: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sot oauth %d: %s", resp.StatusCode, string(body))
	}
	var t sotTokenResp
	if err := json.Unmarshal(body, &t); err != nil {
		return "", fmt.Errorf("sot decode token: %w", err)
	}
	exp := t.ExpiresIn
	if exp <= 0 {
		exp = 7200
	}
	c.token = t.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(exp-60) * time.Second)
	return c.token, nil
}

func (c *sotHTTPClient) get(path string) ([]byte, error) {
	tok, err := c.bearer()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodGet, sotAPIBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")
	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sot %d: %.200s", resp.StatusCode, string(body))
	}
	return body, nil
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CrewActivity struct {
	CrewType          string `json:"crewType"`
	CrewID            string `json:"crewId"`
	ServiceCode       string `json:"serviceCode"`
	Origin            string `json:"origin"`
	Destination       string `json:"destination"`
	DepartureDatetime string `json:"departureDatetime"`
	ArrivalDatetime   string `json:"arrivalDatetime"`
}

type CrewAgent struct {
	EmployeeID string `json:"employee_id"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Phone      string `json:"phone"`
	HomeDepot  string `json:"home_depot"`
}

type EnrichedCrew struct {
	CrewType    string `json:"crewType"`
	CrewID      string `json:"crewId"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Phone       string `json:"phone"`
	HomeDepot   string `json:"homeDepot"`
	ServiceCode string `json:"serviceCode"`
	Origin      string `json:"origin"`
	Destination string `json:"destination"`
	Departure   string `json:"departure"`
	Arrival     string `json:"arrival"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

// GetCrewActivities handles GET /api/crew/activities?date=YYYY-MM-DD&serviceCode=9113
func GetCrewActivities(c *gin.Context) {
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date, use YYYY-MM-DD"})
		return
	}

	// Fetch activities.
	actBody, err := sotclient().get("/v1/activities?operationalDate=" + date)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	var activities []CrewActivity
	if err := json.Unmarshal(actBody, &activities); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "decode activities"})
		return
	}

	// Optional service code filter.
	if svc := c.Query("serviceCode"); svc != "" {
		filtered := activities[:0]
		for _, a := range activities {
			if a.ServiceCode == svc {
				filtered = append(filtered, a)
			}
		}
		activities = filtered
	}

	if len(activities) == 0 {
		c.JSON(http.StatusOK, []EnrichedCrew{})
		return
	}

	// Collect unique crew IDs.
	seen := map[string]bool{}
	var ids []string
	for _, a := range activities {
		if !seen[a.CrewID] {
			seen[a.CrewID] = true
			ids = append(ids, a.CrewID)
		}
	}

	// Fetch agent details.
	agentMap := map[string]CrewAgent{}
	agentBody, err := sotclient().get("/v1/agents?employeeIds=" + strings.Join(ids, ","))
	if err == nil {
		var agents []CrewAgent
		if json.Unmarshal(agentBody, &agents) == nil {
			for _, ag := range agents {
				agentMap[ag.EmployeeID] = ag
			}
		}
	}

	// Merge and return.
	result := make([]EnrichedCrew, 0, len(activities))
	for _, a := range activities {
		ag := agentMap[a.CrewID]
		result = append(result, EnrichedCrew{
			CrewType:    a.CrewType,
			CrewID:      a.CrewID,
			FirstName:   ag.FirstName,
			LastName:    ag.LastName,
			Phone:       ag.Phone,
			HomeDepot:   ag.HomeDepot,
			ServiceCode: a.ServiceCode,
			Origin:      a.Origin,
			Destination: a.Destination,
			Departure:   fmtSOTTime(a.DepartureDatetime),
			Arrival:     fmtSOTTime(a.ArrivalDatetime),
		})
	}
	c.JSON(http.StatusOK, result)
}

func fmtSOTTime(dt string) string {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, dt); err == nil {
			return t.UTC().Format("15:04")
		}
	}
	return dt
}
