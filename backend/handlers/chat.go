package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

## Response style
Be concise and friendly. Show times, durations, and connections clearly.`,
		today, yesterday, tomorrow, today,
	)
}

type ChatRequest struct {
	Message  string         `json:"message" binding:"required"`
	History  []llm.Message  `json:"history"`
}

type ChatResponse struct {
	Reply string `json:"reply"`
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

	reply, err := h.runAgentLoop(ctx, messages, tools, func(token string) {
		b, _ := json.Marshal(token)
		sendEvent("token", string(b))
	}, sendEvent)

	if err != nil {
		sendEvent("error", err.Error())
		return
	}

	b, _ := json.Marshal(ChatResponse{Reply: reply})
	sendEvent("done", string(b))
}

// runAgentLoop runs the LLM → tool-call → LLM loop until the model stops calling tools.
func (h *Handler) runAgentLoop(
	ctx context.Context,
	messages []llm.Message,
	tools []llm.Tool,
	onToken func(string),
	sendEvent func(string, string),
) (string, error) {
	for range maxToolRounds {
		msg, err := h.llm.StreamChat(ctx, messages, tools, onToken)
		if err != nil {
			return "", fmt.Errorf("LLM error: %w", err)
		}

		messages = append(messages, *msg)

		// No tool calls → final answer
		if len(msg.ToolCalls) == 0 {
			return msg.Content, nil
		}

		// Execute each tool call via MCP
		for _, tc := range msg.ToolCalls {
			log.Printf("[tool] call  name=%s args=%s", tc.Function.Name, tc.Function.Arguments)
			sendEvent("tool_call", fmt.Sprintf(`{"name":%q}`, tc.Function.Name))

			result, err := h.mcp.CallTool(ctx, tc.Function.Name, tc.Function.Arguments)
			if err != nil {
				result = fmt.Sprintf("Tool error: %v", err)
			}

			log.Printf("[tool] result name=%s result=%.200s", tc.Function.Name, result)
			sendEvent("tool_result", fmt.Sprintf(`{"name":%q,"result":%q}`, tc.Function.Name, result))

			messages = append(messages, llm.Message{
				Role:       "tool",
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
				Content:    result,
			})
		}
	}
	return "", fmt.Errorf("exceeded %d tool rounds without a final answer", maxToolRounds)
}

// Health handles GET /api/health
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
