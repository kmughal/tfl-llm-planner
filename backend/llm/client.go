// Package llm provides an OpenAI-compatible client pointed at Ollama.
// Ollama exposes /v1/chat/completions so no extra SDK is needed.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultModel = "llama3.2"

type Client struct {
	baseURL string
	model   string
	http    *http.Client
}

func NewClient(baseURL, model string) *Client {
	if baseURL == "" {
		baseURL = "http://localhost:11434/v1"
	}
	if model == "" {
		model = defaultModel
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		http:    &http.Client{Timeout: 120 * time.Second},
	}
}

// ── Message types (OpenAI-compatible) ────────────────────────────────────────

type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"` // "function"
	Function FunctionCall `json:"function"`
}

type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // raw JSON string
}

type Tool struct {
	Type     string       `json:"type"` // "function"
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// ── Internal streaming types ─────────────────────────────────────────────────

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []Tool    `json:"tools,omitempty"`
	Stream   bool      `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
}

// streamDelta is the per-chunk delta from a streaming response.
// tool_calls carry an index so fragments can be merged across chunks.
type streamDelta struct {
	Content   string `json:"content"`
	ToolCalls []struct {
		Index    int          `json:"index"`
		ID       string       `json:"id"`
		Function FunctionCall `json:"function"`
	} `json:"tool_calls"`
}

type streamChunk struct {
	Choices []struct {
		Delta streamDelta `json:"delta"`
	} `json:"choices"`
}

// ── Streaming state ───────────────────────────────────────────────────────────

// toolFragment accumulates the id/name/arguments for one tool call that may
// arrive across multiple streaming deltas.
type toolFragment struct {
	id        string
	name      string
	arguments strings.Builder
}

type streamState struct {
	content   strings.Builder
	fragments map[int]*toolFragment // keyed by streaming index
}

func newStreamState() *streamState {
	return &streamState{fragments: map[int]*toolFragment{}}
}

func (s *streamState) applyDelta(delta streamDelta, onToken func(string)) {
	if delta.Content != "" {
		onToken(delta.Content)
		s.content.WriteString(delta.Content)
	}
	for _, tc := range delta.ToolCalls {
		s.mergeTCFragment(tc.Index, tc.ID, tc.Function.Name, tc.Function.Arguments)
	}
}

func (s *streamState) mergeTCFragment(idx int, id, name, args string) {
	if _, ok := s.fragments[idx]; !ok {
		s.fragments[idx] = &toolFragment{}
	}
	f := s.fragments[idx]
	if id != "" {
		f.id = id
	}
	if name != "" {
		f.name = name
	}
	f.arguments.WriteString(args)
}

func (s *streamState) toMessage() *Message {
	if len(s.fragments) == 0 {
		return &Message{Role: "assistant", Content: s.content.String()}
	}
	calls := make([]ToolCall, len(s.fragments))
	for idx, f := range s.fragments {
		calls[idx] = ToolCall{
			ID:       f.id,
			Type:     "function",
			Function: FunctionCall{Name: f.name, Arguments: f.arguments.String()},
		}
	}
	return &Message{Role: "assistant", ToolCalls: calls}
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *Client) post(ctx context.Context, messages []Message, tools []Tool, stream bool) (*http.Response, error) {
	req := chatRequest{Model: c.model, Messages: messages, Tools: tools, Stream: stream}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("LLM request failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama %d: %s", resp.StatusCode, string(raw))
	}
	return resp, nil
}

// ── Public API ────────────────────────────────────────────────────────────────

// Chat performs a non-streaming completion and returns the assistant Message.
func (c *Client) Chat(ctx context.Context, messages []Message, tools []Tool) (*Message, error) {
	resp, err := c.post(ctx, messages, tools, false)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var cr chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return nil, fmt.Errorf("decode ollama response: %w", err)
	}
	if len(cr.Choices) == 0 {
		return nil, fmt.Errorf("ollama returned no choices")
	}
	msg := cr.Choices[0].Message
	fmt.Printf("Result returned is:", cr.Choices[0])
	return &msg, nil
}

// StreamChat streams a completion, calling onToken for each text token.
// Tool call fragments are merged by index so id/name/arguments are always intact.
func (c *Client) StreamChat(ctx context.Context, messages []Message, tools []Tool, onToken func(string)) (*Message, error) {
	resp, err := c.post(ctx, messages, tools, true)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	state := newStreamState()
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		processSSELine(scanner.Text(), state, onToken)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("stream read error: %w", err)
	}
	return state.toMessage(), nil
}

func processSSELine(line string, state *streamState, onToken func(string)) {
	if !strings.HasPrefix(line, "data: ") {
		return
	}
	data := strings.TrimPrefix(line, "data: ")
	if data == "[DONE]" {
		return
	}
	var chunk streamChunk
	if err := json.Unmarshal([]byte(data), &chunk); err != nil || len(chunk.Choices) == 0 {
		return
	}
	state.applyDelta(chunk.Choices[0].Delta, onToken)
}
