include .env
export

.PHONY: dev mcp backend frontend llm

dev: kill-ports ## Start all services in parallel
	@$(MAKE) -j4 llm mcp backend frontend

mcp: ## Start the MCP server
	@echo "→ MCP server on :$${MCP_PORT:-8081}"
	@cd mcp-server && MCP_TRANSPORT=sse go run .

backend: ## Start the Go backend
	@echo "→ Backend on :$${PORT:-8080}"
	@cd backend && go run .

frontend: ## Start the Vite dev server
	@echo "→ Frontend on :5173"
	@cd frontend && npm run dev

llm: ## Start LLM server
	@echo "→ Starting LLM server on :$${LLM_PORT:-8082}"
	@cd llm && LLM_PORT=$${LLM_PORT:-8082} ollama serve
PORTS=8080 8081 8082 5173

kill-ports:
	@echo "→ Cleaning up ports: $(PORTS)"
	@for port in $(PORTS); do \
		pid=$$(lsof -ti tcp:$$port); \
		if [ ! -z "$$pid" ]; then \
			echo "Killing process $$pid on port $$port"; \
			kill -9 $$pid; \
		else \
			echo "Port $$port is free"; \
		fi \
	done