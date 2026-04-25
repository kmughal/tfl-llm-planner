include .env
export

.PHONY: dev mcp backend frontend

dev: ## Start all three services in parallel
	@$(MAKE) -j3 mcp backend frontend

mcp: ## Start the MCP server
	@echo "→ MCP server on :$${MCP_PORT:-8081}"
	@cd mcp-server && MCP_TRANSPORT=sse go run .

backend: ## Start the Go backend
	@echo "→ Backend on :$${PORT:-8080}"
	@cd backend && go run .

frontend: ## Start the Vite dev server
	@echo "→ Frontend on :5173"
	@cd frontend && npm run dev
