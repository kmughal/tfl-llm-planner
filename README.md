# TFL Journey Planner — AI Assistant

> Ask in plain English. Get real London transport data.  
> **100% free to run.** No paid APIs. No cloud LLM bills.

```
"Fastest route from Paddington to Canary Wharf at 8:30am?"
"Is the Central line running normally right now?"
"Any delays on the Elizabeth line?"
```

---

## What this is

A conversational London transport assistant that combines:

- **Real TFL data** — live journey planning, line status, stop search
- **Local LLM** — Ollama runs on your machine, zero cost, no rate limits
- **MCP (Model Context Protocol)** — the LLM decides which TFL tools to call and when
- **Streaming UI** — tokens stream as the model thinks, tool calls show in real time

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser :3000                        │
│              React + Tailwind (Claude aesthetic)            │
└───────────────────────┬─────────────────────────────────────┘
                        │  POST /api/chat  (SSE stream)
┌───────────────────────▼─────────────────────────────────────┐
│                    Go Backend :8080                         │
│                                                             │
│   1. Receives user message                                  │
│   2. Sends to Ollama with MCP tool definitions              │
│   3. Executes tool calls → MCP server                       │
│   4. Loops until LLM produces final text answer             │
│   5. Streams tokens + tool events back via SSE              │
└──────────┬────────────────────────────┬─────────────────────┘
           │  OpenAI-compatible API     │  SSE MCP client
┌──────────▼──────────┐      ┌──────────▼─────────────────────┐
│   Ollama :11434     │      │     Go MCP Server :8081        │
│                     │      │                                │
│  llama3.2 (local)   │      │  Tools:                        │
│  runs on your GPU   │      │  • plan_journey                │
│  or CPU, free       │      │  • get_line_status             │
└─────────────────────┘      │  • get_status_by_mode          │
                             │  • search_stops                │
                             └──────────┬─────────────────────┘
                                        │  HTTPS
                             ┌──────────▼─────────────────────┐
                             │     api.tfl.gov.uk (free)      │
                             │  /Journey/JourneyResults       │
                             │  /Line/{ids}/Status            │
                             │  /Line/Mode/{mode}/Status      │
                             │  /StopPoint/Search             │
                             └────────────────────────────────┘
```

---

## Stack

| Layer | Tech | Cost |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Free |
| Styling | Tailwind CSS (Claude aesthetic) | Free |
| Backend API | Go + Gin | Free |
| LLM | Ollama (`llama3.2`) | Free — runs locally |
| MCP | `mark3labs/mcp-go` | Free |
| Transport data | TFL Open API | Free |

---

## Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Ollama](https://ollama.com/)

---

## Quick start

### 1 — Install Ollama and pull the model

```bash
brew install ollama        # macOS
# or: curl -fsSL https://ollama.com/install.sh | sh

ollama serve               # keep this running
ollama pull llama3.2       # ~2 GB, one-time download
```

### 2 — Start the MCP server

```bash
cd mcp-server
MCP_TRANSPORT=sse MCP_PORT=8081 go run .
# TFL MCP server starting on SSE :8081
```

### 3 — Start the backend

```bash
cd backend
go run .
# Connected to MCP server at http://localhost:8081/sse
# Backend starting on :8080
```

### 4 — Start the frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

Open `http://localhost:3000` and start asking questions.

---

## Environment variables

### MCP server

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Set to `sse` for HTTP mode |
| `MCP_PORT` | `8081` | SSE server port |
| `TFL_APP_KEY` | _(none)_ | Optional TFL API key for higher rate limits |

### Backend

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama base URL |
| `OLLAMA_MODEL` | `llama3.2` | Model name |
| `MCP_URL` | `http://localhost:8081/sse` | MCP server SSE endpoint |
| `PORT` | `8080` | Backend port |

> **TFL API key** — the free tier works without one. Register at [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk/) for higher rate limits.

---

## MCP tools

| Tool | TFL endpoint | What it does |
|---|---|---|
| `plan_journey` | `/Journey/JourneyResults/{from}/to/{to}` | Full journey planning with legs, times, fares |
| `get_line_status` | `/Line/{ids}/Status` | Status for specific lines by ID |
| `get_status_by_mode` | `/Line/Mode/{mode}/Status` | Status for all lines of a transport mode |
| `search_stops` | `/StopPoint/Search` | Find stations and stops by name |

---

## Example conversations

```
You:       How do I get from King's Cross to Canary Wharf?
Assistant: [calls plan_journey]
           Option 1 — 28 min
             Step 1: Take Jubilee line from King's Cross St. Pancras
             Step 2: Alight at Canary Wharf
           ...

You:       Any problems on the tube right now?
Assistant: [calls get_status_by_mode with mode=tube]
           ✓ Bakerloo: Good Service
           ✓ Central: Good Service
           ⚠ District: Minor Delays — Signal failure at Earls Court...

You:       Find stations near Waterloo
Assistant: [calls search_stops]
           • Waterloo (tube, national-rail, bus)
           • Waterloo East (national-rail)
           ...
```

---

## Project structure

```
tfl-llm-sample/
├── mcp-server/          # Go — MCP server exposing TFL as tools
│   ├── main.go          # Server entrypoint, stdio/SSE transport
│   ├── tfl/
│   │   └── client.go    # TFL HTTP client (journey, status, stops)
│   └── tools/
│       ├── journey.go   # plan_journey tool
│       ├── status.go    # get_line_status tool
│       ├── status_by_mode.go  # get_status_by_mode tool
│       └── stops.go     # search_stops tool
│
├── backend/             # Go — API server + agentic loop
│   ├── main.go          # Gin server, MCP connection with retry
│   ├── handlers/
│   │   └── chat.go      # POST /api/chat — SSE streaming + agent loop
│   ├── llm/
│   │   └── client.go    # Ollama client (streaming, tool call accumulation)
│   └── mcpclient/
│       └── client.go    # MCP SSE client with auto-reconnect
│
└── frontend/            # React + TypeScript
    └── src/
        ├── App.tsx              # Main layout
        ├── hooks/useChat.ts     # SSE stream consumer + state
        └── components/
            ├── MessageBubble.tsx   # Chat messages with markdown
            ├── ChatInput.tsx       # Auto-growing textarea
            ├── ToolCallBadge.tsx   # Live tool call indicators
            └── SuggestionPills.tsx # Quick-start prompts
```

---

## How the agent loop works

```
User message
    │
    ▼
Build messages [ system | history | user ]
    │
    ▼
┌─────────────────────────────────────┐
│  LLM (Ollama) with 4 TFL tools      │
│                                     │
│  Streaming output:                  │
│  • text tokens → streamed to UI     │
│  • tool_calls  → captured + merged  │
└──────────┬──────────────────────────┘
           │ tool_calls present?
    ┌──────▼──────┐
    │  YES        │  NO → return final answer
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────┐
    │  Execute tool via MCP server    │
    │  → real TFL API call            │
    │  → add result to messages       │
    └──────┬──────────────────────────┘
           │
           └──── loop (max 5 rounds)
```

---

## Licence

MIT
