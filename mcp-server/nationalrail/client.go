package nationalrail

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const baseURL = "https://huxley2.azurewebsites.net"

var KnownStations = map[string]string{
	"london st pancras": "STP", "st pancras": "STP", "st pancras international": "STP",
	"kings cross": "KGX", "king's cross": "KGX", "london kings cross": "KGX", "london king's cross": "KGX",
	"london bridge": "LBG", "waterloo": "WAT", "london waterloo": "WAT", "victoria": "VIC", "london victoria": "VIC",
	"paddington": "PAD", "london paddington": "PAD", "euston": "EUS", "london euston": "EUS",
	"ashford international": "AFK", "ashford": "AFK", "ebbsfleet international": "EBD", "ebbsfleet": "EBD",
	"stratford international": "SFA", "stratford": "SRA", "liverpool street": "LST", "london liverpool street": "LST",
	"birmingham new street": "BHM", "manchester piccadilly": "MAN", "leeds": "LDS", "york": "YRK",
	"newcastle": "NCL", "edinburgh waverley": "EDB", "edinburgh": "EDB", "glasgow central": "GLC",
	"bristol temple meads": "BRI", "cardiff central": "CDF", "brighton": "BTN", "cambridge": "CBG",
}

type Client struct {
	http  *http.Client
	token string
}

func NewClient(darwinToken string) *Client {
	return &Client{http: &http.Client{Timeout: 15 * time.Second}, token: darwinToken}
}

type DeparturesResponse struct {
	LocationName           string         `json:"locationName"`
	CRS                    string         `json:"crs"`
	GeneratedAt            string         `json:"generatedAt"`
	StationManager         string         `json:"stationManager"`
	PlatformsAreHidden     bool           `json:"platformsAreHidden"`
	ServicesAreUnavailable bool           `json:"servicesAreUnavailable"`
	NRCCMessages           []NRCCMessage  `json:"nrccMessages"`
	TrainServices          []TrainService `json:"trainServices"`
}

type NRCCMessage struct {
	XHTMLMessage string `json:"xhtmlMessage"`
}

type TrainService struct {
	STA                 string        `json:"sta"`
	STASpecified        bool          `json:"staSpecified"`
	ETA                 string        `json:"eta"`
	ETASpecified        bool          `json:"etaSpecified"`
	ATA                 string        `json:"ata"`
	ATASpecified        bool          `json:"ataSpecified"`
	STD                 string        `json:"std"`
	STDSpecified        bool          `json:"stdSpecified"`
	ETD                 string        `json:"etd"`
	ETDSpecified        bool          `json:"etdSpecified"`
	ATD                 string        `json:"atd"`
	ATDSpecified        bool          `json:"atdSpecified"`
	Platform            string        `json:"platform"`
	PlatformIsHidden    bool          `json:"platformIsHidden"`
	ServiceIsSuppressed bool          `json:"serviceIsSupressed"`
	Operator            string        `json:"operator"`
	OperatorCode        string        `json:"operatorCode"`
	Origin              []Destination `json:"origin"`
	Destination         []Destination `json:"destination"`
	IsCancelled         bool          `json:"isCancelled"`
	TrainID             string        `json:"trainid"`
	UID                 string        `json:"uid"`
	RID                 string        `json:"rid"`
	Length              int           `json:"length"`
	CancelReason        *Reason       `json:"cancelReason"`
	DelayReason         *Reason       `json:"delayReason"`
}

type Reason struct {
	Value int `json:"value"`
}

type Destination struct {
	LocationName string `json:"locationName"`
	CRS          string `json:"crs"`
	Via          string `json:"via"`
}

const dtLayout = "2006-01-02T15:04:05"

func FormatHHMM(dt string) string {
	t, err := time.Parse(dtLayout, dt)
	if err != nil || t.Year() < 2000 {
		return ""
	}
	return t.Format("15:04")
}

func DelayMins(scheduled, expected string) int {
	s, err1 := time.Parse(dtLayout, scheduled)
	e, err2 := time.Parse(dtLayout, expected)
	if err1 != nil || err2 != nil || e.Year() < 2000 {
		return 0
	}
	mins := int(e.Sub(s).Minutes())
	if mins < 0 {
		return 0
	}
	return mins
}

func (c *Client) GetDepartures(crs string, count int) (*DeparturesResponse, error) {
	return c.getBoard("staffdepartures", crs, count)
}

func (c *Client) GetArrivals(crs string, count int) (*DeparturesResponse, error) {
	return c.getBoard("staffarrivals", crs, count)
}

func (c *Client) getBoard(kind, crs string, count int) (*DeparturesResponse, error) {
	_ = c.token // The public Huxley2 instance supplies its Darwin credentials internally.
	u := fmt.Sprintf("%s/%s/%s/%d", baseURL, kind, strings.ToUpper(crs), count)
	resp, err := c.http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("national rail %s: %w", kind, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read national rail response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("huxley2 returned %d", resp.StatusCode)
	}
	var result DeparturesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode national rail response: %w", err)
	}
	return &result, nil
}

var htmlTag = regexp.MustCompile(`<[^>]*>`)

func PlainMessage(value string) string {
	return strings.TrimSpace(html.UnescapeString(htmlTag.ReplaceAllString(value, " ")))
}
