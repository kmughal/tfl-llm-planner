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

func buildSystemPrompt() string {
	now := time.Now().UTC()
	today := now.Format(dateFmt)
	tomorrow := now.AddDate(0, 0, 1).Format(dateFmt)
	yesterday := now.AddDate(0, 0, -1).Format(dateFmt)
	return fmt.Sprintf(`You are a helpful transport assistant for three networks: TFL (London), SNCF (France), and Eurostar (cross-channel).

## Current date
Today: %s | Yesterday: %s | Tomorrow: %s (UTC)
Always resolve relative dates ("today", "tomorrow", "two days ago") using the above before calling any tool.
Pass dates to get_euromap_plans / get_euromap_technical_plans as ISO8601, e.g. "%sT00:00:00Z".

## Tool routing — follow this decision table strictly

| Situation | Tool to call |
|---|---|
| Journey between two London locations | plan_journey |
| Status of a specific TFL line (e.g. "Central line") | get_line_status |
| Status overview of all lines of a mode (e.g. "all tube lines") | get_status_by_mode |
| Find a London station or stop by name | search_stops |
| Train journey where BOTH ends are in France | plan_sncf_journey |
| French rail disruptions or service alerts | get_sncf_disruptions |
| Find a French station by name | search_sncf_stations |
| Any cross-channel journey (London↔Paris, London↔Brussels, London↔Amsterdam) | get_euromap_plans |
| User mentions "Eurostar", "Channel Tunnel", or trains between UK and Europe | get_euromap_plans |
| User asks for Eurostar schedules or "what trains are running" | get_euromap_plans |
| User explicitly asks for "technical plans", "operational plans", or "engineering" (no specific train) | get_euromap_technical_plans |
| User asks when a specific Eurostar train arrives/departs at a station (e.g. "what time does 9004 reach Paris?", "when does train 9409 arrive?") | get_euromap_plan_by_id |
| User mentions a specific train/service number without asking for technical details (e.g. "Give me plan for train 9004", "show service 9409") | get_euromap_plan_by_id |
| User explicitly asks for technical/operational details of a SPECIFIC train number | get_euromap_technical_plan_by_id |

## Disambiguation rules
- Paris → London or London → Paris: always use get_euromap_plans, NOT plan_sncf_journey
- "Eurostar plans" (no qualifier) → get_euromap_plans
- "Eurostar technical plans" → get_euromap_technical_plans
- Never call plan_sncf_journey for any journey involving the UK

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

## General response style
Be concise. For status checks, one sentence per line per disrupted item is enough.
Never repeat what the tool already said in paragraph form.`,
		today, yesterday, tomorrow, today,
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
