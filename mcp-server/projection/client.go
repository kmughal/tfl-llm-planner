package projection

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client calls the eurostar-projection read API (default: http://localhost:8090).
type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = "http://localhost:8090"
	}
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) get(path string, out any) error {
	resp, err := c.http.Get(c.baseURL + path)
	if err != nil {
		return fmt.Errorf("projection GET %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("projection %s: HTTP %d: %s", path, resp.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}

// ── Types ─────────────────────────────────────────────────────────────────────
// JSON tags use PascalCase to match the projection API's response format.

type Service struct {
	ID                 string `json:"ID"`
	ServiceDate        string `json:"ServiceDate"`
	ServiceNumber      string `json:"ServiceNumber"`
	RouteType          string `json:"RouteType"`
	ServiceType        string `json:"ServiceType"`
	IsCancelled        bool   `json:"IsCancelled"`
	TrainSetNumber     string `json:"TrainSetNumber"`
	EquipmentType      string `json:"EquipmentType"`
	LineID             string `json:"LineID"`
	OriginCode         string `json:"OriginCode"`
	OriginName         string `json:"OriginName"`
	DestinationCode    string `json:"DestinationCode"`
	DestinationName    string `json:"DestinationName"`
	ScheduledDeparture string `json:"ScheduledDeparture"`
	ScheduledArrival   string `json:"ScheduledArrival"`
	UpdatedAt          string `json:"UpdatedAt"`
}

type Stop struct {
	ID                string `json:"ID"`
	ServiceID         string `json:"ServiceID"`
	Code              string `json:"Code"`
	Name              string `json:"Name"`
	PointType         string `json:"PointType"`
	ArrivalTime       string `json:"ArrivalTime"`
	PassingTime       string `json:"PassingTime"`
	DepartureTime     string `json:"DepartureTime"`
	DeparturePlatform string `json:"DeparturePlatform"`
	ArrivalPlatform   string `json:"ArrivalPlatform"`
	IsCancelled       bool   `json:"IsCancelled"`
	StopIndex         int    `json:"StopIndex"`
}

type CrewLeg struct {
	ID               string `json:"ID"`
	ShiftID          string `json:"ShiftID"`
	ServiceID        string `json:"ServiceID"`
	ServiceNumber    string `json:"ServiceNumber"`
	ServiceDate      string `json:"ServiceDate"`
	OriginCode       string `json:"OriginCode"`
	DestinationCode  string `json:"DestinationCode"`
	CrewRole         string `json:"CrewRole"`
	PlannedDeparture string `json:"PlannedDeparture"`
	PlannedArrival   string `json:"PlannedArrival"`
}

type Coupling struct {
	ID            string `json:"ID"`
	HeadServiceID string `json:"HeadServiceID"`
	TailServiceID string `json:"TailServiceID"`
	FromCode      string `json:"FromCode"`
	ToCode        string `json:"ToCode"`
	UpdatedAt     string `json:"UpdatedAt"`
}

type Booking struct {
	ID           string `json:"ID"`
	ServiceID    string `json:"ServiceID"`
	OriginCode   string `json:"OriginCode"`
	DestCode     string `json:"DestCode"`
	ServiceClass string `json:"ServiceClass"`
	Count        int    `json:"Count"`
}

type GPSEvent struct {
	ID           string `json:"ID"`
	ServiceID    string `json:"ServiceID"`
	StopCode     string `json:"StopCode"`
	EventType    string `json:"EventType"`
	ActualTime   string `json:"ActualTime"`
	IsCorrection bool   `json:"IsCorrection"`
}

type BeaconEvent struct {
	ID           string `json:"ID"`
	PathwayID    string `json:"PathwayID"`
	ServiceDate  string `json:"ServiceDate"`
	StopCode     string `json:"StopCode"`
	EventType    string `json:"EventType"`
	ActualTime   string `json:"ActualTime"`
	IsCorrection bool   `json:"IsCorrection"`
}

type CommercialService struct {
	ID                 string `json:"ID"`
	ServiceDate        string `json:"ServiceDate"`
	ServiceNumber      string `json:"ServiceNumber"`
	RouteType          string `json:"RouteType"`
	IsCancelled        bool   `json:"IsCancelled"`
	OriginCode         string `json:"OriginCode"`
	OriginName         string `json:"OriginName"`
	DestinationCode    string `json:"DestinationCode"`
	DestinationName    string `json:"DestinationName"`
	ScheduledDeparture string `json:"ScheduledDeparture"`
	ScheduledArrival   string `json:"ScheduledArrival"`
	UpdatedAt          string `json:"UpdatedAt"`
}

type CommercialStop struct {
	ID            string `json:"ID"`
	ServiceID     string `json:"ServiceID"`
	Name          string `json:"Name"`
	ArrivalTime   string `json:"ArrivalTime"`
	DepartureTime string `json:"DepartureTime"`
	IsCancelled   bool   `json:"IsCancelled"`
	StopIndex     int    `json:"StopIndex"`
}

type News struct {
	ID            string `json:"ID"`
	Department    string `json:"Department"`
	AuthorID      string `json:"AuthorID"`
	Category      string `json:"Category"`
	IsArchived    bool   `json:"IsArchived"`
	IsUnpublished bool   `json:"IsUnpublished"`
	PublishedAt   string `json:"PublishedAt"`
	UpdatedAt     string `json:"UpdatedAt"`
}

type ServiceDetail struct {
	Service   Service       `json:"service"`
	Stops     []Stop        `json:"stops"`
	Crew      []CrewLeg     `json:"crew"`
	Couplings []Coupling    `json:"couplings"`
	Bookings  []Booking     `json:"bookings"`
	GPS       []GPSEvent    `json:"gps"`
	Beacons   []BeaconEvent `json:"beacons"`
}

// ── API methods ───────────────────────────────────────────────────────────────

func (c *Client) ListCommercialServices(date string) ([]CommercialService, error) {
	var resp struct {
		Services []CommercialService `json:"services"`
	}
	if err := c.get("/commercial/services?date="+date, &resp); err != nil {
		return nil, err
	}
	return resp.Services, nil
}

func (c *Client) ListServices(date string) ([]Service, error) {
	var resp struct {
		Services []Service `json:"services"`
	}
	if err := c.get("/services?date="+date, &resp); err != nil {
		return nil, err
	}
	return resp.Services, nil
}

func (c *Client) GetServiceDetail(date, serviceNumber string) (*ServiceDetail, error) {
	var detail ServiceDetail
	if err := c.get("/services/"+date+"/"+serviceNumber, &detail); err != nil {
		return nil, err
	}
	return &detail, nil
}

func (c *Client) ListNews() ([]News, error) {
	var resp struct {
		News []News `json:"news"`
	}
	if err := c.get("/news", &resp); err != nil {
		return nil, err
	}
	return resp.News, nil
}
