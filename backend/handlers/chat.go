package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"tfl-backend/llm"
	"tfl-backend/mcpclient"
)

const maxToolRounds = 5 // prevent runaway agentic loops

const systemPrompt = `You are a helpful transport assistant with access to real-time data for two networks:
- TFL (Transport for London): tube, bus, DLR, Overground, Elizabeth line
- SNCF (French national rail): TGV, Intercités, TER trains across France

For London journeys use plan_journey; for line delays use get_line_status or get_status_by_mode.
For French train journeys use plan_sncf_journey; for French disruptions use get_sncf_disruptions.
Use search_stops for London stations and search_sncf_stations for French stations.
Keep responses concise and friendly. Format journey options clearly with times and durations.`

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
