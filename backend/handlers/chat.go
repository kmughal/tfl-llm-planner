package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"tfl-backend/llm"
	"tfl-backend/logger"
	"tfl-backend/mcpclient"
	"tfl-backend/memory"
)

const maxToolRounds = 5 // prevent runaway agentic loops

const dateFmt = "2006-01-02"

// nextWeekday returns the next occurrence of wd strictly after from.
func nextWeekday(from time.Time, wd time.Weekday) time.Time {
	d := from.AddDate(0, 0, 1)
	for d.Weekday() != wd {
		d = d.AddDate(0, 0, 1)
	}
	return d
}

// lastWeekday returns the most recent occurrence of wd strictly before from.
func lastWeekday(from time.Time, wd time.Weekday) time.Time {
	d := from.AddDate(0, 0, -1)
	for d.Weekday() != wd {
		d = d.AddDate(0, 0, -1)
	}
	return d
}

// buildDateAnchors returns a pre-computed date-reference table for the prompt.
func buildDateAnchors(now time.Time) string {
	f := dateFmt
	var sb strings.Builder

	// ── Near days ────────────────────────────────────────────────────────────
	sb.WriteString("Near days (all UTC):\n")
	for _, offset := range []int{-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7} {
		d := now.AddDate(0, 0, offset)
		var label string
		switch offset {
		case -1:
			label = "Yesterday"
		case 0:
			label = "Today    "
		case 1:
			label = "Tomorrow "
		default:
			if offset < 0 {
				label = fmt.Sprintf("%d days ago", -offset)
			} else {
				label = fmt.Sprintf("In %d days ", offset)
			}
		}
		fmt.Fprintf(&sb, "  %-14s %s  (%s)\n", label, d.Format(f), d.Weekday())
	}

	// ── Next occurrence of each weekday ───────────────────────────────────────
	sb.WriteString("\nNext weekday occurrences:\n")
	for _, wd := range []time.Weekday{
		time.Monday, time.Tuesday, time.Wednesday, time.Thursday,
		time.Friday, time.Saturday, time.Sunday,
	} {
		fmt.Fprintf(&sb, "  Next %-9s  %s\n", wd, nextWeekday(now, wd).Format(f))
	}

	// ── Last occurrence of each weekday ───────────────────────────────────────
	sb.WriteString("\nLast weekday occurrences:\n")
	for _, wd := range []time.Weekday{
		time.Monday, time.Tuesday, time.Wednesday, time.Thursday,
		time.Friday, time.Saturday, time.Sunday,
	} {
		fmt.Fprintf(&sb, "  Last %-9s  %s\n", wd, lastWeekday(now, wd).Format(f))
	}

	// ── Month anchors ─────────────────────────────────────────────────────────
	firstThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastThisMonth := firstThisMonth.AddDate(0, 1, -1)
	firstNextMonth := firstThisMonth.AddDate(0, 1, 0)
	lastNextMonth := firstNextMonth.AddDate(0, 1, -1)
	firstLastMonth := firstThisMonth.AddDate(0, -1, 0)
	lastLastMonth := firstThisMonth.AddDate(0, 0, -1)
	fmt.Fprintf(&sb, "\nMonth anchors:\n")
	fmt.Fprintf(&sb, "  First of this month:  %s  (%s)\n", firstThisMonth.Format(f), firstThisMonth.Month())
	fmt.Fprintf(&sb, "  Last  of this month:  %s\n", lastThisMonth.Format(f))
	fmt.Fprintf(&sb, "  First of next month:  %s  (%s)\n", firstNextMonth.Format(f), firstNextMonth.Month())
	fmt.Fprintf(&sb, "  Last  of next month:  %s\n", lastNextMonth.Format(f))
	fmt.Fprintf(&sb, "  First of last month:  %s  (%s)\n", firstLastMonth.Format(f), firstLastMonth.Month())
	fmt.Fprintf(&sb, "  Last  of last month:  %s\n", lastLastMonth.Format(f))

	// ── Year anchors ──────────────────────────────────────────────────────────
	fmt.Fprintf(&sb, "\nYear anchors:\n")
	fmt.Fprintf(&sb, "  Same date last year:  %s\n", now.AddDate(-1, 0, 0).Format(f))
	fmt.Fprintf(&sb, "  Same date next year:  %s\n", now.AddDate(1, 0, 0).Format(f))
	fmt.Fprintf(&sb, "  Start of this year:   %s\n", time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC).Format(f))
	fmt.Fprintf(&sb, "  Start of next year:   %s\n", time.Date(now.Year()+1, 1, 1, 0, 0, 0, 0, time.UTC).Format(f))

	return sb.String()
}

func buildSystemPrompt() string {
	now := time.Now().UTC()
	today := now.Format(dateFmt)
	return fmt.Sprintf(`You are a helpful transport assistant covering: TFL (London local), National Rail (UK mainline), SNCF (French rail), Eurostar (cross-channel), Paris RER/Metro, and Weather.

## Current date & time anchors
Current UTC time: %s %s

%s
## Date arithmetic rules (apply before calling any tool)
Use the anchor table above for all relative date expressions. For expressions not covered directly:
- "in N days/weeks"      → today + N×1 / N×7 days
- "N days/weeks ago"     → today − N×1 / N×7 days
- "in N months"          → advance month by N, keep same day (clamp to end of month if needed)
- "N months ago"         → retreat month by N, keep same day
- "this weekend"         → the coming Saturday from the anchor table (Next Saturday)
- "end of month"         → Last of this month from the anchor table
- "next [MonthName]"     → first day of the next occurrence of that calendar month
- "last [MonthName]"     → first day of the most recent past occurrence of that calendar month
- "next year"/"last year"→ use Year anchors above
- "[Day] [ordinal] [Month]" e.g. "5th May", "May 5" → construct YYYY-MM-DD using current year; if that date has already passed use next year
- NEVER guess or invent a date. If a date expression is ambiguous, ask the user to clarify.

## Date format conversion (mandatory — wrong format = tool error)
| Tool | Parameter | Required format | Example value |
|------|-----------|-----------------|---------------|
| get_euromap_plans | fromDateTime | YYYY-MM-DDT00:00:00Z | %sT00:00:00Z |
| get_euromap_technical_plans | fromDateTime | YYYY-MM-DDT00:00:00Z | %sT00:00:00Z |
| get_eurostar_dashboard | fromDateTime | YYYY-MM-DDT00:00:00Z | %sT00:00:00Z |
| get_eurostar_live_map | fromDateTime | YYYY-MM-DDT00:00:00Z | %sT00:00:00Z |
| get_euromap_plan_by_id | date | YYYYMMDD (no dashes) | %s |
| get_euromap_technical_plan_by_id | date | YYYYMMDD (no dashes) | %s |
| plan_sncf_journey | datetime | YYYYMMDDTHHmmss | %sT090000 |
| plan_journey | time | HHmm 24-hour | 0900 |

Conversion rule: strip the dashes from YYYY-MM-DD → YYYYMMDD. Append T00:00:00Z for ISO tools.

## STEP 1 — Identify the network BEFORE choosing a tool

Read the user message and identify which network they are asking about. The named network locks the tool family — never cross networks.

| User mentions… | Network | Allowed tool family |
|---|---|---|
| "Eurostar", "Channel Tunnel", "cross-channel", London↔Paris/Brussels/Amsterdam/Rotterdam | **EUROSTAR** | get_euromap_*, get_eurostar_* ONLY |
| "TFL", "tube", "Underground", "London bus", "Elizabeth line", "Overground", London local journey (A→B both in London) | **TFL** | plan_journey, get_line_status, get_status_by_mode, search_stops, get_bus_arrivals, get_bus_lines, get_tfl_roads, get_road_disruptions ONLY |
| "SNCF", "French trains", "TGV", "Ouigo", "France" (no cross-channel), "French strike" | **SNCF** | plan_sncf_journey, get_sncf_*, search_sncf_* ONLY |
| "National Rail", "trains from [UK station]", "departures from [mainline station]", "connecting trains", "what trains", "next train to [UK city]" | **NRAIL** | get_national_rail_departures ONLY |
| "weather", "rain", "temperature", "forecast", "will it rain", "cold", "hot", "umbrella", "pack" | **WEATHER** | get_weather ONLY |
| "Paris metro", "RER", "Gare du Nord", "Paris transit", "metro from", "how to get into Paris", "from Gare de Lyon/Montparnasse/Saint-Lazare/Chatelet/Gare de l'Est" | **PARIS** | get_paris_metro_departures ONLY |

**CRITICAL — King's Cross, St Pancras, Ashford, Ebbsfleet are National Rail mainline stations — use get_national_rail_departures, NEVER plan_journey (TFL).**
**CRITICAL — "Departures from [station]" without a destination = departure board → use get_national_rail_departures for mainline UK stations.**
**CRITICAL — plan_journey is ONLY for journeys with both origin AND destination inside London's TFL network (tube, bus, DLR, Overground, Elizabeth line).**
**CRITICAL — never call get_sncf_disruptions for Eurostar or TFL queries.**
**CRITICAL — never call TFL tools for National Rail, Eurostar, or SNCF queries.**
**CRITICAL — never invent a tool name that does not exist. Only use the exact tool names listed here.**

If the user names a network, that name takes absolute precedence over all keyword matching below.

## STEP 2 — Tool routing — read TOP TO BOTTOM, use the FIRST matching row

| Situation | Tool to call |
|---|---|
| Journey between two London locations | plan_journey |
| Status of a specific TFL line (e.g. "Central line") | get_line_status |
| Status overview of all lines of a mode (e.g. "all tube lines") | get_status_by_mode |
| Find a London station or stop by name | search_stops |
| User asks about TFL road network, road status, road conditions, road update, or "all TFL roads" | get_tfl_roads |
| User asks about disruptions, closures, or works on a SPECIFIC road (e.g. "A1", "A40") | get_road_disruptions |
| User asks to see ALL buses, browse all bus routes, list all bus lines, or "show me all buses" | get_all_bus_lines |
| User asks for live bus arrivals, next bus at a stop/street, or "when is the [number] bus" | get_bus_arrivals — use stop_name for named stops, line_id for route number, stop_code for NaPTAN codes |
| **CRITICAL — parameter extraction**: extract stop name AND bus number from the CURRENT message ONLY — never reuse values from earlier in the conversation | "Buses at Brisbane Road" → stop_name="Brisbane Road"; "169 at Oxford Street" → stop_name="Oxford Street", line_id="169"; "When is the 169?" → line_id="169" |
| **Cancelled, delayed, disrupted, or affected Eurostar trains** | **get_eurostar_dashboard** |
| **User says "departure board", "full departure board", "dashboard", "full schedule", "all departures", "all services today", "all trains today", or "list all trains" for Eurostar** | **get_eurostar_dashboard** |
| **User explicitly asks for a MAP, live map, or to plot/visualise train positions** | **get_eurostar_live_map** |
| User explicitly asks for technical/operational details of a SPECIFIC train number | get_euromap_technical_plan_by_id |
| **User asks about a SPECIFIC service number** — patterns: "service 9114", "s 9114", "train 9114", "9114 today", "is 9114 running", "9114 status", "where does 9114 stop", "9114 on [date]" — extract the number and call with that planID. **MANDATORY: immediately also call get_crew_activities with the same date (YYYY-MM-DD) and serviceCode in the same round.** | **get_euromap_plan_by_id + get_crew_activities** |
| User explicitly asks for "technical plans", "operational plans", or "engineering" (no specific train) | get_euromap_technical_plans |
| Any cross-channel journey (London↔Paris, London↔Brussels, London↔Amsterdam) | get_euromap_plans |
| User asks which services are running today (no specific number) | get_euromap_plans |
| Any other question about Eurostar services | get_euromap_plans |
| Train journey where BOTH ends are in France | plan_sncf_journey |
| French rail disruptions, cancellations, or service alerts (SNCF only — NOT Eurostar, NOT TFL) | get_sncf_disruptions |
| Find a French station by name | search_sncf_stations |
| **User asks for train departures FROM a UK mainline station** (King's Cross, St Pancras, Ebbsfleet, Ashford, Waterloo, Paddington, Victoria, Euston) | **get_national_rail_departures** — pass station name exactly as stated |
| "Connecting trains after Eurostar", "onward trains from Ebbsfleet/Ashford/St Pancras" | get_national_rail_departures |
| "Trains from [UK station]", "departures from [UK station]", "what's running from [UK station]", "[UK station] to [UK city] by National Rail/train" | get_national_rail_departures — always use the FROM station; there is no NR journey planner tool |
| Weather query — "weather in X", "will it rain", "temperature", "forecast", "umbrella", "conditions" | get_weather — pass city name |
| Paris transit — departures from a Paris station (Gare du Nord, Gare de Lyon, Montparnasse, Saint-Lazare, Gare de l'Est, Chatelet), or "how to get into Paris from Gare du Nord" | get_paris_metro_departures — pass station name exactly |

## Disambiguation rules
- Paris → London or London → Paris: always use get_euromap_plans, NOT plan_sncf_journey
- "Eurostar plans" (no qualifier) → get_euromap_plans
- "Eurostar technical plans" → get_euromap_technical_plans
- Never call plan_sncf_journey for any journey involving the UK
- "Cancelled trains on Eurostar" or "which Eurostar trains are cancelled" → get_eurostar_dashboard (shows cancelled status per service)
- Any message containing a 4-digit Eurostar service number (e.g. 9004, 9114, 9301) WITHOUT asking for a full list → get_euromap_plan_by_id with that number as planID
- NEVER call get_euromap_plans when the user has specified a single service number
- Disruptions/cancellations + Eurostar → get_eurostar_dashboard, NEVER get_sncf_disruptions
- Disruptions/cancellations + TFL → get_line_status or get_status_by_mode, NEVER get_sncf_disruptions
- "Departures from King's Cross" / "Departures from St Pancras" / "Trains from Ebbsfleet" → get_national_rail_departures, NEVER plan_journey
- plan_journey is ONLY for local London trips (A→B both within London TFL network). A single station name with no destination = departure board = get_national_rail_departures.
- "King's Cross" as a standalone query or "departures from King's Cross" = National Rail mainline (KGX), not TFL tube station.
- "[UK city/station] to [UK city]" using National Rail → call get_national_rail_departures with the FROM station. There is NO national rail journey planner — show all departures from the origin station and the user can see services to their destination. NEVER invent a tool called "plan_national_rail" — it does not exist.
- "Live arrivals from X to Y" or "trains from X to Y" (National Rail) → get_national_rail_departures with station=X. The word "to Y" is just a filter hint — still call the departures tool with the FROM station.
- Weather for any city → get_weather. Never answer weather from training data.
- "How to get from Gare du Nord into Paris" → get_paris_metro_departures with station="Gare du Nord". This is Paris RER/Metro, not SNCF intercity.

## MANDATORY TOOL USE — Eurostar queries
If the user asks ANYTHING about Eurostar trains, services, schedules, train numbers, or routes:
- You MUST call get_euromap_plans (or get_euromap_plan_by_id for a specific train number).
- ALWAYS also call get_crew_activities for the same date when showing Eurostar train results, so driver/crew information is displayed alongside every service.
- NEVER answer from memory or training data — Eurostar schedules change daily.
- NEVER suggest "check the website" or "contact customer service" — call the tool instead.
- If the user asks about a past date, still call get_euromap_plans with that date's fromDateTime.

## Crew / driver queries (SOT Enabler)
| User asks… | Tool |
|---|---|
| "Who is driving train [N] today/on [date]?" | get_crew_activities with serviceCode=[N] |
| "Which drivers are on duty on [date]?" | get_crew_activities with date=[date] |
| "Show crew/drivers for Eurostar on [date]" | get_crew_activities with date=[date] |
| "[crewId]'s schedule for [month]" / "monthly rota for [crewId]" | get_crew_monthly_schedule with crewId, year, month |

- **MANDATORY**: whenever get_euromap_plan_by_id is called, ALWAYS call get_crew_activities in the SAME round with matching date (YYYY-MM-DD) and serviceCode equal to the planID. Never skip this — show crew even if the result is empty.
- Always call get_crew_activities alongside any get_euromap_plans call — pass the same operational date (YYYY-MM-DD).
- Resolve "this Sunday", "next Saturday", etc. from the date anchor table before passing to the tool.
- For monthly schedules: extract year and month from the user's message; default to current month if unspecified.

## Last train / last departure queries (CRITICAL)
When user asks for the "last train", "last Eurostar", "last departure", or "last service":
- For cross-channel routes (Paris↔London, London↔Brussels, etc.): call get_euromap_plans with fromDateTime set to TODAY at 18:00:00Z so only evening services are returned and individual train cards render.
  Example: if today is %s, use "%sT18:00:00Z"
- This ensures the result has fewer than 5 services and renders as visual map cards, not a bulk summary.
- NEVER call plan_sncf_journey for Paris→London or any route involving the UK — this is always Eurostar.
- NEVER invent train times — use ONLY what the tool returns.
- Find the service with the LATEST departure time from the stated origin and state: "The last Eurostar from [origin] to [destination] departs at [time] (service [code])."

## Journey response format — MANDATORY RULE
When a tool returns journey options in "Option N —" format, you MUST reproduce that EXACT structure.
Do NOT paraphrase, summarise, or rewrite journeys as prose sentences.

BAD (never do this):
  "Take the Elizabeth line from Paddington and alight at Waterloo..."

GOOD (always do this — copy the Option block verbatim from the tool result):
  Option 1 — 22min | Direct
    Departs: 09:05 | Arrives: 09:27
    Stop: Paddington (09:05)
    Stop: London Bridge (09:27)
    Step 1: Elizabeth line (elizabeth-line, 22 min)

The UI renders each "Option N —" block as an interactive animated card. If you rewrite it as prose, the card will not appear. Always output the raw "Option N — ..." blocks from the tool result, then add a one-sentence comment below if needed.

## Eurostar bulk status response
When get_euromap_plans returns more than 5 services the result contains grouped status lines (e.g. "Active (128): 9001 9002 …") — those codes are the ONLY data available for individual services.

Two cases:
- **User asked for a general overview / status** → respond with 2–4 plain-text sentences: total count, status breakdown, direction split. Do NOT list individual numbers.
  Example: "Today there are 134 Eurostar services: 128 active and 6 cancelled. 67 run outbound (UK→Europe) and 67 inbound (Europe→UK)."
- **User explicitly asked for service numbers / codes** → copy the codes verbatim from the "Active / Cancelled / …" lines in the tool result and present them as a plain list. Do NOT add departure times, station names, routes, or any detail not present in the tool result — that data does not exist in a bulk result and you must not invent it.

## Eurostar dashboard response
When get_eurostar_dashboard is called, the tool emits a DASHBOARD_START/DASHBOARD_SERVICE/DASHBOARD_END block that the UI renders automatically.
Respond with 1–2 plain-text sentences only: date, total services, active/cancelled count.
Do NOT list individual train numbers, routes, or times — the UI board already shows all of that.
Example: "Here's the live Eurostar departure board for 2026-04-30 — 134 services in total, 128 active and 6 cancelled."

## Eurostar live map response
When get_eurostar_live_map is called, the tool emits LIVEMAP_START/LIVEMAP_SERVICE/LIVEMAP_END blocks that the UI renders automatically as an interactive animated map.
Respond with 1–2 plain-text sentences only: date, total services, active/cancelled count.
Do NOT list individual train numbers, routes, times, or stop details — the UI map already shows all of that.
Example: "Here's the live Eurostar train map for 2026-04-30 — 134 services plotted, 128 active and 6 cancelled."

## Bus lines response
When get_all_bus_lines is called, the tool emits a BUS_LINES_START/BUS_LINE/BUS_LINES_END block that the UI renders as an interactive animated grid of clickable bus roundels.
Respond with 1 plain-text sentence only: how many routes are shown and that the user can click any roundel to see live arrivals.
Do NOT list individual route numbers — the UI grid already shows all of them.
Example: "Here are all 700 London bus routes — click any roundel to see live arrivals."

## Bus arrivals response
When get_bus_arrivals is called, the tool emits a BUS_ARRIVALS_START/BUS/BUS_ARRIVALS_END block that the UI renders as a live countdown board.
Respond with 1–2 plain-text sentences only: stop name, total buses due, and the soonest arrival.
Do NOT list individual bus lines or times — the UI board already shows all of that.
Example: "Here are live arrivals at Oxford Circus (Stop W) — 8 buses due, next is the 73 in under 1 minute."

## National Rail response
When get_national_rail_departures is called, the tool emits a NRAIL_START/DEP/NRAIL_END block that the UI renders as an animated departure board.
Respond with 1–2 plain-text sentences only: station name, number of departures, next departure.
Do NOT list individual trains, times, or platforms — the UI board already shows all of that.
Example: "Here are live departures from London St Pancras — 10 trains shown, next is the 15:02 to Sheffield on platform 4."
If the result starts with [SAMPLE DATA], tell the user the live feed is temporarily unavailable and the board shows demo data.

## Weather response
When get_weather is called, the tool emits a WEATHER_START/CURRENT/FORECAST/WEATHER_END block that the UI renders as an animated weather card.
Respond with 1–2 plain-text sentences answering the user's specific question (e.g. "Yes, rain is expected in Paris this afternoon").
Do NOT repeat all the raw numbers — the UI card shows the full forecast.

## Paris Metro/RER response
When get_paris_metro_departures is called, the tool emits a RATP_START/DEP/RATP_END block that the UI renders as a metro-style departure board.
Respond with 1–2 plain-text sentences only: station name, number of departures, and which lines are shown.
Do NOT list individual trains or times — the UI board already shows all of that.
Example: "Here are live departures from Gare du Nord — RER B, RER D, and Transilien H services shown."

## Data integrity — STRICT RULE
Never invent, fabricate, or guess transport data. Use ONLY what the tools return.
If a tool result does not contain the information needed, say so in one sentence — do not generate fictional schedules, dates, airlines, or routes.
The current year is %d. Do not reference any other year unless a tool explicitly provides it.

## General response style
Be concise. For status checks, one sentence per line per disrupted item is enough.
Never repeat what the tool already said in paragraph form.`,
		// %s %s  — date + weekday header
		today, now.Weekday(),
		// %s    — full date-anchor table
		buildDateAnchors(now),
		// %s ×4 — ISO example values for euromap/dashboard/livemap tools
		today, today, today, today,
		// %s ×3 — compact YYYYMMDD example values for plan_by_id and sncf tools
		now.Format("20060102"), now.Format("20060102"), now.Format("20060102"),
		// %s ×2 — last-train section: "if today is X, use XT18:00:00Z"
		today, today,
		// %d    — current year
		now.Year(),
	)
}

type ChatRequest struct {
	Message   string        `json:"message" binding:"required"`
	History   []llm.Message `json:"history"`   // full LLM message sequence from previous turns
	SessionID string        `json:"sessionId"` // stable per-user identifier (from localStorage)
	ConvID    string        `json:"convId"`    // current conversation ID (for memory upsert key)
}

type ChatResponse struct {
	Reply    string        `json:"reply"`
	Messages []llm.Message `json:"messages"` // full sequence for the client to replay next turn
}

type Handler struct {
	llm *llm.Client
	mcp *mcpclient.MCPClient
	mem memory.Store
}

func NewHandler(llmClient *llm.Client, mcpClient *mcpclient.MCPClient, memStore memory.Store) *Handler {
	return &Handler{llm: llmClient, mcp: mcpClient, mem: memStore}
}

// memorySummary extracts a short human-readable digest from the final message
// sequence. Only plain user/assistant text is included — no tool call payloads.
func memorySummary(messages []llm.Message, date string) string {
	var text []llm.Message
	for _, m := range messages {
		if (m.Role == "user" || m.Role == "assistant") && m.Content != "" && len(m.ToolCalls) == 0 {
			text = append(text, m)
		}
	}
	if len(text) > 6 {
		text = text[len(text)-6:]
	}
	if len(text) == 0 {
		return ""
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "[%s]\n", date)
	for _, m := range text {
		role := "User"
		if m.Role == "assistant" {
			role = "Assistant"
		}
		content := m.Content
		if len(content) > 250 {
			content = content[:250] + "…"
		}
		fmt.Fprintf(&sb, "%s: %s\n", role, content)
	}
	return strings.TrimSpace(sb.String())
}

// Chat handles POST /api/chat with SSE streaming back to the client.
func (h *Handler) Chat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	logger.Info(logger.TagHTTP, "POST /api/chat", fmt.Sprintf("msg=%.120s history_len=%d session=%s", req.Message, len(req.History), req.SessionID))

	ctx := c.Request.Context()

	tools, err := h.mcp.ListAsLLMTools(ctx)
	if err != nil {
		logger.Error(logger.TagMCP, "ListAsLLMTools failed", err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tools: " + err.Error()})
		return
	}
	logger.Debug(logger.TagMCP, fmt.Sprintf("tools loaded: %d available", len(tools)), "")

	systemPrompt := h.systemPromptWithMemory(ctx, req.SessionID)

	// Build message history
	messages := make([]llm.Message, 0, len(req.History)+2)
	messages = append(messages, llm.Message{Role: "system", Content: systemPrompt})
	messages = append(messages, req.History...)
	messages = append(messages, llm.Message{Role: "user", Content: req.Message})

	// Set up SSE streaming
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	flusher, canFlush := c.Writer.(http.Flusher)

	sendEvent := func(event, data string) {
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, data)
		if canFlush {
			flusher.Flush()
		}
	}

	reply, finalMessages, err := h.runAgentLoop(ctx, messages, tools, func(token string) {
		b, _ := json.Marshal(token)
		sendEvent("token", string(b))
	}, sendEvent)

	if err != nil {
		sendEvent("error", err.Error())
		return
	}

	h.saveMemory(ctx, req.SessionID, req.ConvID, finalMessages)

	// Return the full message sequence minus system messages so the client can
	// replay it verbatim as history on the next turn — this preserves tool
	// call/result pairs that would otherwise be lost.
	b, _ := json.Marshal(ChatResponse{Reply: reply, Messages: clientHistory(finalMessages)})
	sendEvent("done", string(b))
}

// systemPromptWithMemory builds the system prompt and appends any stored
// memories for the session so the LLM has cross-session context.
func (h *Handler) systemPromptWithMemory(ctx context.Context, sessionID string) string {
	prompt := buildSystemPrompt()
	if sessionID == "" {
		return prompt
	}
	mems, err := h.mem.Retrieve(ctx, sessionID, 5)
	if err != nil || len(mems) == 0 {
		return prompt
	}
	return prompt + "\n\n## Memory from previous conversations\n" + strings.Join(mems, "\n---\n")
}

// saveMemory extracts a plain-text summary from the final message sequence and
// upserts it into the memory store so future sessions can recall this conversation.
func (h *Handler) saveMemory(ctx context.Context, sessionID, convID string, messages []llm.Message) {
	if sessionID == "" || convID == "" {
		return
	}
	today := time.Now().UTC().Format(dateFmt)
	summary := memorySummary(messages, today)
	if summary == "" {
		return
	}
	if err := h.mem.Upsert(ctx, sessionID, convID, summary); err != nil {
		logger.Warn(logger.TagSystem, "memory upsert failed", err.Error())
	}
}

// clientHistory strips system messages from the full message sequence.
// System messages are rebuilt fresh every turn; sending them as history
// would duplicate instructions and inflate token usage.
func clientHistory(msgs []llm.Message) []llm.Message {
	out := make([]llm.Message, 0, len(msgs))
	for _, m := range msgs {
		if m.Role != "system" {
			out = append(out, m)
		}
	}
	return out
}

// journeyTools is the set of tools whose results must be reproduced verbatim.
var journeyTools = map[string]bool{
	"plan_journey":      true,
	"plan_sncf_journey": true,
}

// journeyFormatReminder is injected right before the final LLM turn whenever a
// journey tool was called, so the model sees it as the freshest instruction.
const journeyFormatReminder = `FORMAT RULE — mandatory for this turn only:
The tool above returned journey options in "Option N —" format.
You MUST output those Option blocks verbatim. Do NOT convert them to prose sentences.
Each "Option N —" line triggers an animated journey card in the UI. Prose breaks it.
After the Option blocks you may add one short sentence of context if needed.`

// containsJourneyFormat reports whether s contains the structured Option format
// that the frontend's journey card renderer looks for.
func containsJourneyFormat(s string) bool {
	return strings.Contains(s, "Option 1")
}

// cleanJourneyResult strips the backend HINT footer before sending the tool
// result directly to the frontend (the hint was only meant for the LLM).
func cleanJourneyResult(s string) string {
	if idx := strings.LastIndex(s, "HINT:"); idx != -1 {
		return strings.TrimSpace(s[:idx])
	}
	return strings.TrimSpace(s)
}

// validToolNames builds a set of available tool names from the tools slice.
func validToolNames(tools []llm.Tool) map[string]bool {
	names := make(map[string]bool, len(tools))
	for _, t := range tools {
		names[t.Function.Name] = true
	}
	return names
}

// toolNames returns a comma-separated list of available tool names.
func toolNames(tools []llm.Tool) string {
	names := make([]string, len(tools))
	for i, t := range tools {
		names[i] = t.Function.Name
	}
	return strings.Join(names, ", ")
}

// runAgentLoop runs the LLM → tool-call → LLM loop until the model stops calling tools.
// Returns the final reply, the complete message sequence (for the client to replay as
// history on the next turn), and any error.
func (h *Handler) runAgentLoop(
	ctx context.Context,
	messages []llm.Message,
	tools []llm.Tool,
	onToken func(string),
	sendEvent func(string, string),
) (string, []llm.Message, error) {
	var journeyResult string // last structured journey tool result
	valid := validToolNames(tools)

	for range maxToolRounds {
		msg, err := h.llm.StreamChat(ctx, messages, tools, onToken)
		if err != nil {
			logger.Error(logger.TagLLM, "StreamChat error", err.Error())
			return "", nil, fmt.Errorf("LLM error: %w", err)
		}
		messages = append(messages, *msg)

		if len(msg.ToolCalls) == 0 {
			logger.Info(logger.TagLLM, fmt.Sprintf("final reply %.120s", msg.Content), fmt.Sprintf("len=%d", len(msg.Content)))
			return h.resolveFinalReply(msg.Content, journeyResult), messages, nil
		}
		logger.Debug(logger.TagLLM, fmt.Sprintf("tool calls requested: %d", len(msg.ToolCalls)), "")

		var updated []llm.Message
		updated, journeyResult = h.executeToolCalls(ctx, msg.ToolCalls, journeyResult, valid, tools, sendEvent)
		messages = append(messages, updated...)
	}
	return "", nil, fmt.Errorf("exceeded %d tool rounds without a final answer", maxToolRounds)
}

// resolveFinalReply returns the LLM content, or the saved journey result when
// the LLM failed to reproduce the structured Option format.
func (h *Handler) resolveFinalReply(llmContent, journeyResult string) string {
	if journeyResult != "" && !containsJourneyFormat(llmContent) {
		log.Printf("[journey] LLM produced prose — overriding with structured tool result")
		logger.Warn(logger.TagLLM, "LLM produced prose — overriding with structured journey result", "")
		return journeyResult
	}
	return llmContent
}

// executeToolCalls runs every tool call in one LLM turn, appends tool-result
// messages, and returns an updated journeyResult if a journey tool was called.
func (h *Handler) executeToolCalls(
	ctx context.Context,
	calls []llm.ToolCall,
	journeyResult string,
	valid map[string]bool,
	tools []llm.Tool,
	sendEvent func(string, string),
) ([]llm.Message, string) {
	msgs := make([]llm.Message, 0, len(calls)+1)
	journeyToolCalled := false

	for _, tc := range calls {
		log.Printf("[tool] call  name=%s args=%s", tc.Function.Name, tc.Function.Arguments)
		logger.Info(logger.TagTool, fmt.Sprintf("call  %s", tc.Function.Name), tc.Function.Arguments)
		sendEvent("tool_call", fmt.Sprintf(`{"name":%q}`, tc.Function.Name))

		// Guard: reject hallucinated tool names before hitting the MCP server.
		var result string
		if !valid[tc.Function.Name] {
			result = fmt.Sprintf(
				"ERROR: tool %q does not exist. You MUST only call tools from this list: %s. "+
					"For National Rail departures use get_national_rail_departures with station=<name>. "+
					"Call the correct tool now.",
				tc.Function.Name, toolNames(tools),
			)
			logger.Warn(logger.TagTool, fmt.Sprintf("hallucinated tool %q rejected", tc.Function.Name), "")
		} else {
			var err error
			result, err = h.mcp.CallTool(ctx, tc.Function.Name, tc.Function.Arguments)
			if err != nil {
				result = fmt.Sprintf("Tool error: %v", err)
				logger.Error(logger.TagTool, fmt.Sprintf("error %s", tc.Function.Name), err.Error())
			}
		}

		if journeyTools[tc.Function.Name] && containsJourneyFormat(result) {
			journeyResult = cleanJourneyResult(result)
			journeyToolCalled = true
		}

		log.Printf("[tool] result name=%s result=%.200s", tc.Function.Name, result)
		logger.Info(logger.TagTool, fmt.Sprintf("result %s", tc.Function.Name), fmt.Sprintf("%.300s", result))
		sendEvent("tool_result", fmt.Sprintf(`{"name":%q,"result":%q}`, tc.Function.Name, result))

		msgs = append(msgs, llm.Message{
			Role:       "tool",
			ToolCallID: tc.ID,
			Name:       tc.Function.Name,
			Content:    result,
		})

		// Auto-inject crew data whenever a specific plan is fetched.
		// We fire SSE events only — not adding to msgs — so the LLM history
		// stays clean (avoids nil-content errors from Ollama).
		if tc.Function.Name == "get_euromap_plan_by_id" {
			crewDate, crewSvc := extractCrewArgs(tc.Function.Arguments)
			if crewDate != "" && crewSvc != "" {
				crewArgs := fmt.Sprintf(`{"date":%q,"serviceCode":%q}`, crewDate, crewSvc)
				sendEvent("tool_call", `{"name":"get_crew_activities"}`)
				log.Printf("[tool] auto-crew call date=%s svc=%s", crewDate, crewSvc)
				crewResult, crewErr := h.mcp.CallTool(ctx, "get_crew_activities", crewArgs)
				if crewErr != nil {
					crewResult = fmt.Sprintf("Crew data unavailable: %v", crewErr)
				}
				log.Printf("[tool] auto-crew result %.200s", crewResult)
				sendEvent("tool_result", fmt.Sprintf(`{"name":"get_crew_activities","result":%q}`, crewResult))
			}
		}
	}

	if journeyToolCalled {
		msgs = append(msgs, llm.Message{Role: "system", Content: journeyFormatReminder})
	}
	return msgs, journeyResult
}

// extractCrewArgs parses get_euromap_plan_by_id arguments and returns the
// operational date (YYYY-MM-DD) and serviceCode needed for get_crew_activities.
func extractCrewArgs(argsJSON string) (date, serviceCode string) {
	var args map[string]string
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", ""
	}
	today := time.Now().UTC().Format(dateFmt)

	compact2ISO := func(d string) string {
		if len(d) == 8 {
			return d[:4] + "-" + d[4:6] + "-" + d[6:8]
		}
		return d
	}

	if pid := args["planID"]; pid != "" {
		parts := strings.SplitN(pid, "-", 2)
		if len(parts) == 2 && len(parts[0]) == 8 {
			return compact2ISO(parts[0]), parts[1]
		}
		// planID is just a service number with no date prefix
		return today, pid
	}

	svc := args["serviceCode"]
	if svc == "" {
		return "", ""
	}
	d := args["date"]
	if d == "" {
		return today, svc
	}
	return compact2ISO(d), svc
}

// Health handles GET /api/health
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
