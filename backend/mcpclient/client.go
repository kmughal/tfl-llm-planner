package mcpclient

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
	"tfl-backend/llm"
)

type MCPClient struct {
	mu     sync.Mutex
	c      *client.Client
	sseURL string
}

func New(ctx context.Context, sseURL string) (*MCPClient, error) {
	m := &MCPClient{sseURL: sseURL}
	if err := m.connect(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *MCPClient) connect(ctx context.Context) error {
	c, err := client.NewSSEMCPClient(m.sseURL)
	if err != nil {
		return fmt.Errorf("create MCP client: %w", err)
	}
	if err := c.Start(context.Background()); err != nil {
		return fmt.Errorf("start MCP client: %w", err)
	}
	if _, err := c.Initialize(ctx, mcp.InitializeRequest{}); err != nil {
		return fmt.Errorf("MCP initialize: %w", err)
	}
	m.c = c
	return nil
}

// reconnect rebuilds the SSE connection. Called automatically on session errors.
func (m *MCPClient) reconnect() error {
	log.Println("MCP session lost, reconnecting…")
	return m.connect(context.Background())
}

func isSessionError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "Invalid session ID")
}

// ListAsLLMTools fetches the tool list, reconnecting once on session errors.
func (m *MCPClient) ListAsLLMTools(ctx context.Context) ([]llm.Tool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	result, err := m.c.ListTools(ctx, mcp.ListToolsRequest{})
	if isSessionError(err) {
		if rerr := m.reconnect(); rerr != nil {
			return nil, fmt.Errorf("MCP reconnect failed: %w", rerr)
		}
		result, err = m.c.ListTools(ctx, mcp.ListToolsRequest{})
	}
	if err != nil {
		return nil, fmt.Errorf("list MCP tools: %w", err)
	}

	tools := make([]llm.Tool, 0, len(result.Tools))
	for _, t := range result.Tools {
		tools = append(tools, llm.Tool{
			Type: "function",
			Function: llm.ToolFunction{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  schemaToMap(t.InputSchema),
			},
		})
	}
	return tools, nil
}

// CallTool executes a tool, reconnecting once on session errors.
func (m *MCPClient) CallTool(ctx context.Context, name, argsJSON string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var args map[string]any
	if argsJSON != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return "", fmt.Errorf("parse tool args: %w", err)
		}
	}

	req := mcp.CallToolRequest{}
	req.Params.Name = name
	req.Params.Arguments = args

	result, err := m.c.CallTool(ctx, req)
	if isSessionError(err) {
		if rerr := m.reconnect(); rerr != nil {
			return "", fmt.Errorf("MCP reconnect failed: %w", rerr)
		}
		result, err = m.c.CallTool(ctx, req)
	}
	if err != nil {
		return "", fmt.Errorf("MCP call %s: %w", name, err)
	}

	var sb string
	for _, c := range result.Content {
		if tc, ok := c.(mcp.TextContent); ok {
			sb += tc.Text + "\n"
		}
	}
	return sb, nil
}

func schemaToMap(schema mcp.ToolInputSchema) map[string]any {
	b, err := json.Marshal(schema)
	if err != nil {
		return map[string]any{"type": "object"}
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return map[string]any{"type": "object"}
	}
	return m
}
