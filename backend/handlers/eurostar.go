package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	euromapTokenURL = "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token"
	euromapAPIBase  = "https://gateway.dm.eurostar.com/euromap-enabler"
)

var planIDRe = regexp.MustCompile(`^\d{8}-\d+$`)

type eurostarCatalogCache struct {
	mu       sync.RWMutex
	date     string
	fetched  time.Time
	services []EurostarCatalogItem
}

var eurostarCatalog = &eurostarCatalogCache{}

// ── OAuth-cached HTTP client ──────────────────────────────────────────────────

type euromapHTTPClient struct {
	hc           *http.Client
	clientID     string
	clientSecret string
	mu           sync.Mutex
	token        string
	tokenExpiry  time.Time
}

var (
	_ecOnce sync.Once
	_ec     *euromapHTTPClient
)

func eclient() *euromapHTTPClient {
	_ecOnce.Do(func() {
		_ec = &euromapHTTPClient{
			hc:           &http.Client{Timeout: 20 * time.Second},
			clientID:     os.Getenv("EUROMAP_CLIENT_ID"),
			clientSecret: os.Getenv("EUROMAP_CLIENT_SECRET"),
		}
	})
	return _ec
}

type oauthPayload struct {
	AccessToken string      `json:"access_token"`
	ExpiresIn   oauthExpiry `json:"expires_in"`
}

func (c *euromapHTTPClient) bearer() (string, error) {
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
	resp, err := c.hc.Post(euromapTokenURL, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("oauth: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth %d: %s", resp.StatusCode, string(body))
	}
	var t oauthPayload
	if err := json.Unmarshal(body, &t); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	exp := int(t.ExpiresIn)
	if exp <= 0 {
		exp = 3600
	}
	c.token = t.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(exp-30) * time.Second)
	return c.token, nil
}

func (c *euromapHTTPClient) get(path string, params url.Values) ([]byte, error) {
	tok, err := c.bearer()
	if err != nil {
		return nil, err
	}
	u := euromapAPIBase + path
	if len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, u, nil)
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
		return nil, fmt.Errorf("euromap %d: %.200s", resp.StatusCode, string(body))
	}
	return body, nil
}

// ── Response types ────────────────────────────────────────────────────────────

type EuromapStation struct {
	SequenceNumber    int    `json:"sequenceNumber"`
	StopType          string `json:"stopType"`
	RameNumber        string `json:"rameNumber,omitempty"`
	Country           string `json:"country"`
	RRCode            string `json:"rrCode,omitempty"`
	ShortCode         string `json:"shortCode"`
	Latitude          string `json:"latitude,omitempty"`
	Longitude         string `json:"longitude,omitempty"`
	DepartureDatetime string `json:"departureDateTime,omitempty"`
	ArrivalDatetime   string `json:"arrivalDatetime,omitempty"`
}

type EuromapPlan struct {
	Range             string           `json:"range"`
	Status            string           `json:"status"`
	PlanID            string           `json:"planID"`
	PlanType          string           `json:"planType"`
	ServiceCode       string           `json:"serviceCode"`
	DepartureDatetime string           `json:"departureDateTime"`
	ArrivalDatetime   string           `json:"arrivalDateTime"`
	Stations          []EuromapStation `json:"stations"`
}

type EurostarCatalogItem struct {
	PlanID            string `json:"planID"`
	ServiceCode       string `json:"serviceCode"`
	Status            string `json:"status"`
	DepartureDateTime string `json:"departureDateTime"`
	ArrivalDateTime   string `json:"arrivalDateTime"`
	OriginCode        string `json:"originCode"`
	OriginName        string `json:"originName"`
	DestinationCode   string `json:"destinationCode"`
	DestinationName   string `json:"destinationName"`
	RouteKey          string `json:"routeKey"`
}

type EurostarCatalogResponse struct {
	Date       string                `json:"date"`
	Cached     bool                  `json:"cached"`
	FetchedAt  string                `json:"fetchedAt"`
	Count      int                   `json:"count"`
	Services   []EurostarCatalogItem `json:"services"`
	RouteCount int                   `json:"routeCount"`
}

func stationNameForCode(code string) string {
	switch strings.ToUpper(code) {
	case "SPX":
		return "London St Pancras"
	case "PNO":
		return "Paris Gare du Nord"
	case "BXL", "BRU":
		return "Brussels-Midi"
	case "LIL":
		return "Lille Europe"
	case "AMS", "ASD":
		return "Amsterdam Centraal"
	case "RTD", "RDM":
		return "Rotterdam Centraal"
	case "EBF":
		return "Ebbsfleet International"
	case "ASH":
		return "Ashford International"
	default:
		return code
	}
}

func originStop(plan EuromapPlan) string {
	for _, stop := range plan.Stations {
		if strings.EqualFold(stop.StopType, "origin") {
			return stop.ShortCode
		}
	}
	if len(plan.Stations) > 0 {
		return plan.Stations[0].ShortCode
	}
	return ""
}

func destinationStop(plan EuromapPlan) string {
	for _, stop := range plan.Stations {
		if strings.EqualFold(stop.StopType, "destination") {
			return stop.ShortCode
		}
	}
	if len(plan.Stations) > 0 {
		return plan.Stations[len(plan.Stations)-1].ShortCode
	}
	return ""
}

func buildEurostarCatalog(plans []EuromapPlan) []EurostarCatalogItem {
	items := make([]EurostarCatalogItem, 0, len(plans))
	for _, plan := range plans {
		originCode := originStop(plan)
		destinationCode := destinationStop(plan)
		originName := stationNameForCode(originCode)
		destinationName := stationNameForCode(destinationCode)
		items = append(items, EurostarCatalogItem{
			PlanID:            plan.PlanID,
			ServiceCode:       plan.ServiceCode,
			Status:            plan.Status,
			DepartureDateTime: plan.DepartureDatetime,
			ArrivalDateTime:   plan.ArrivalDatetime,
			OriginCode:        originCode,
			OriginName:        originName,
			DestinationCode:   destinationCode,
			DestinationName:   destinationName,
			RouteKey:          originName + "|||" + destinationName,
		})
	}
	return items
}

func getCachedEurostarCatalog(date string) ([]EurostarCatalogItem, bool, time.Time, error) {
	now := time.Now().UTC()

	eurostarCatalog.mu.RLock()
	if eurostarCatalog.date == date && now.Sub(eurostarCatalog.fetched) < 24*time.Hour && len(eurostarCatalog.services) > 0 {
		services := append([]EurostarCatalogItem(nil), eurostarCatalog.services...)
		fetched := eurostarCatalog.fetched
		eurostarCatalog.mu.RUnlock()
		return services, true, fetched, nil
	}
	eurostarCatalog.mu.RUnlock()

	params := url.Values{}
	params.Set("fromDateTime", date+"T00:00:00Z")
	params.Set("range", "thalys,channel")

	body, err := eclient().get("/v1/plans", params)
	if err != nil {
		return nil, false, time.Time{}, err
	}

	var plans []EuromapPlan
	if err := json.Unmarshal(body, &plans); err != nil {
		return nil, false, time.Time{}, fmt.Errorf("decode error")
	}

	services := buildEurostarCatalog(plans)

	eurostarCatalog.mu.Lock()
	eurostarCatalog.date = date
	eurostarCatalog.fetched = now
	eurostarCatalog.services = append([]EurostarCatalogItem(nil), services...)
	eurostarCatalog.mu.Unlock()

	return services, false, now, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GetEurostarTrains handles GET /api/eurostar/trains?date=YYYY-MM-DD
func GetEurostarTrains(c *gin.Context) {
	if !IsServiceEnabled("eurostar") {
		serviceDisabledJSON(c, "eurostar")
		return
	}
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date, use YYYY-MM-DD"})
		return
	}

	params := url.Values{}
	params.Set("fromDateTime", date+"T00:00:00Z")
	params.Set("range", "thalys,channel")
	cacheKey := "eurostar/trains/" + date

	body, err := eclient().get("/v1/plans", params)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var plans []EuromapPlan
	if err := json.Unmarshal(body, &plans); err != nil {
		if respondWithCachedSnapshot(c, cacheKey, "decode error") {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "decode error"})
		return
	}
	respondJSONAndCache(c, cacheKey, http.StatusOK, plans)
}

// GetEurostarTrainByID handles GET /api/eurostar/trains/:planID
func GetEurostarTrainByID(c *gin.Context) {
	if !IsServiceEnabled("eurostar") {
		serviceDisabledJSON(c, "eurostar")
		return
	}
	planID := c.Param("planID")
	if !planIDRe.MatchString(planID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid planID format"})
		return
	}
	cacheKey := "eurostar/train/" + planID

	body, err := eclient().get("/v1/plans/"+planID, nil)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var plan EuromapPlan
	if err := json.Unmarshal(body, &plan); err != nil {
		if respondWithCachedSnapshot(c, cacheKey, "decode error") {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "decode error"})
		return
	}
	respondJSONAndCache(c, cacheKey, http.StatusOK, plan)
}

// GetEurostarCatalog handles GET /api/eurostar/catalog?date=YYYY-MM-DD
func GetEurostarCatalog(c *gin.Context) {
	if !IsServiceEnabled("eurostar") {
		serviceDisabledJSON(c, "eurostar")
		return
	}
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date, use YYYY-MM-DD"})
		return
	}
	cacheKey := "eurostar/catalog/" + date

	services, cached, fetchedAt, err := getCachedEurostarCatalog(date)
	if err != nil {
		if respondWithCachedSnapshot(c, cacheKey, err.Error()) {
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	routes := map[string]struct{}{}
	for _, item := range services {
		routes[item.RouteKey] = struct{}{}
	}

	respondJSONAndCache(c, cacheKey, http.StatusOK, EurostarCatalogResponse{
		Date:       date,
		Cached:     cached,
		FetchedAt:  fetchedAt.Format(time.RFC3339),
		Count:      len(services),
		Services:   services,
		RouteCount: len(routes),
	})
}
