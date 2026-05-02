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
	"tfl-backend/mcpclient"
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
	return fmt.Sprintf(`You are a helpful transport assistant for three networks: TFL (London), SNCF (France), and Eurostar (cross-channel).

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

## Tool routing — read TOP TO BOTTOM, use the FIRST row that matches

| Situation | Tool to call |
|---|---|
| Journey between two London locations | plan_journey |
| Status of a specific TFL line (e.g. "Central line") | get_line_status |
| Status overview of all lines of a mode (e.g. "all tube lines") | get_status_by_mode |
| Find a London station or stop by name | search_stops |
| Train journey where BOTH ends are in France | plan_sncf_journey |
| French rail disruptions or service alerts | get_sncf_disruptions |
| Find a French station by name | search_sncf_stations |
| **User says "departure board", "dashboard", or "build dashboard" for Eurostar** | **get_eurostar_dashboard** |
| **User asks for a live map, to plot trains, or "where are the trains"** | **get_eurostar_live_map** |
| User explicitly asks for technical/operational details of a SPECIFIC train number | get_euromap_technical_plan_by_id |
| User asks when a specific train arrives/departs, or mentions a specific service number | get_euromap_plan_by_id |
| User explicitly asks for "technical plans", "operational plans", or "engineering" (no specific train) | get_euromap_technical_plans |
| Any cross-channel journey (London↔Paris, London↔Brussels, London↔Amsterdam) | get_euromap_plans |
| User mentions Eurostar, Channel Tunnel, or trains between UK and Europe | get_euromap_plans |
| User asks for train numbers, service codes, or which trains ran on a date | get_euromap_plans |
| Any other question about Eurostar services | get_euromap_plans |

## Disambiguation rules
- Paris → London or London → Paris: always use get_euromap_plans, NOT plan_sncf_journey
- "Eurostar plans" (no qualifier) → get_euromap_plans
- "Eurostar technical plans" → get_euromap_technical_plans
- Never call plan_sncf_journey for any journey involving the UK

## MANDATORY TOOL USE — Eurostar queries
If the user asks ANYTHING about Eurostar trains, services, schedules, train numbers, or routes:
- You MUST call get_euromap_plans (or get_euromap_plan_by_id for a specific train number).
- NEVER answer from memory or training data — Eurostar schedules change daily.
- NEVER suggest "check the website" or "contact customer service" — call the tool instead.
- If the user asks about a past date, still call get_euromap_plans with that date's fromDateTime.

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
	Message string        `json:"message" binding:"required"`
	History []llm.Message `json:"history"` // full LLM message sequence from previous turns
}

type ChatResponse struct {
	Reply    string        `json:"reply"`
	Messages []llm.Message `json:"messages"` // full sequence for the client to replay next turn
}

type Handler struct {
	llm *llm.Client
	mcp *mcpclient.MCPClient
}

func NewHandler(llmClient *llm.Client, mcpClient *mcpclient.MCPClient) *Handler {
	return &Handler{llm: llmClient, mcp: mcpClient}
}

// Chat handles POST /api/chat with SSE streaming back to the client.
func (h *Handler) Chat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	tools, err := h.mcp.ListAsLLMTools(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tools: " + err.Error()})
		return
	}

	// Build message history
	messages := make([]llm.Message, 0, len(req.History)+2)
	messages = append(messages, llm.Message{Role: "system", Content: buildSystemPrompt()})
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

	// Return the full message sequence minus system messages so the client can
	// replay it verbatim as history on the next turn — this preserves tool
	// call/result pairs that would otherwise be lost.
	b, _ := json.Marshal(ChatResponse{Reply: reply, Messages: clientHistory(finalMessages)})
	sendEvent("done", string(b))
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

	for range maxToolRounds {
		msg, err := h.llm.StreamChat(ctx, messages, tools, onToken)
		if err != nil {
			return "", nil, fmt.Errorf("LLM error: %w", err)
		}
		messages = append(messages, *msg)

		if len(msg.ToolCalls) == 0 {
			return h.resolveFinalReply(msg.Content, journeyResult), messages, nil
		}

		var updated []llm.Message
		updated, journeyResult = h.executeToolCalls(ctx, msg.ToolCalls, journeyResult, sendEvent)
		messages = append(messages, updated...)
	}
	return "", nil, fmt.Errorf("exceeded %d tool rounds without a final answer", maxToolRounds)
}

// resolveFinalReply returns the LLM content, or the saved journey result when
// the LLM failed to reproduce the structured Option format.
func (h *Handler) resolveFinalReply(llmContent, journeyResult string) string {
	if journeyResult != "" && !containsJourneyFormat(llmContent) {
		log.Printf("[journey] LLM produced prose — overriding with structured tool result")
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
	sendEvent func(string, string),
) ([]llm.Message, string) {
	msgs := make([]llm.Message, 0, len(calls)+1)
	journeyToolCalled := false

	for _, tc := range calls {
		log.Printf("[tool] call  name=%s args=%s", tc.Function.Name, tc.Function.Arguments)
		sendEvent("tool_call", fmt.Sprintf(`{"name":%q}`, tc.Function.Name))

		result, err := h.mcp.CallTool(ctx, tc.Function.Name, tc.Function.Arguments)
		if err != nil {
			result = fmt.Sprintf("Tool error: %v", err)
		}

		if journeyTools[tc.Function.Name] && containsJourneyFormat(result) {
			journeyResult = cleanJourneyResult(result)
			journeyToolCalled = true
		}

		log.Printf("[tool] result name=%s result=%.200s", tc.Function.Name, result)
		sendEvent("tool_result", fmt.Sprintf(`{"name":%q,"result":%q}`, tc.Function.Name, result))

		msgs = append(msgs, llm.Message{
			Role:       "tool",
			ToolCallID: tc.ID,
			Name:       tc.Function.Name,
			Content:    result,
		})
	}

	if journeyToolCalled {
		msgs = append(msgs, llm.Message{Role: "system", Content: journeyFormatReminder})
	}
	return msgs, journeyResult
}

// Health handles GET /api/health
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
