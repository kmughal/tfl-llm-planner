# TFL + SNCF Journey Planner — AI Assistant

> Ask in plain English. Get real transport data for London and France.  
> **100% free to run.** No cloud LLM bills.

```
"Fastest route from Paddington to Canary Wharf at 8:30am?"
"Is the Central line running normally right now?"
"Plan a train journey from Paris to Lyon tomorrow morning."
"Are there any disruptions on the SNCF network?"
```

---

## What this is

A conversational transport assistant that combines:

- **Real TFL data** — live journey planning, line status, stop search across London
- **Real SNCF data** — French rail journey planning, station search, disruptions, departures
- **Local LLM** — Ollama runs on your machine, zero cost, no rate limits
- **MCP (Model Context Protocol)** — the LLM decides which tools to call and when
- **Streaming UI** — tokens stream as the model thinks, tool calls show in real time

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser :3000                        │
│              React + Tailwind (rich transport UI)           │
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
│  llama3.2 (local)   │      │  TFL tools:                    │
│  runs on your GPU   │      │  • plan_journey                │
│  or CPU, free       │      │  • get_line_status             │
└─────────────────────┘      │  • get_status_by_mode          │
                             │  • search_stops                │
                             │                                │
                             │  SNCF tools:                   │
                             │  • plan_sncf_journey           │
                             │  • search_sncf_stations        │
                             │  • get_sncf_disruptions        │
                             └──────────┬─────────────────────┘
                                        │  HTTPS
                             ┌──────────▼─────────────────────┐
                             │     api.tfl.gov.uk (free)      │
                             │  /Journey/JourneyResults       │
                             │  /Line/{ids}/Status            │
                             │  /StopPoint/Search             │
                             └────────────────────────────────┘
                             ┌──────────▼─────────────────────┐
                             │  api.sncf.com/v1/coverage/sncf │
                             │  /places                       │
                             │  /journeys                     │
                             │  /disruptions                  │
                             │  /stop_areas/{id}/departures   │
                             └────────────────────────────────┘
```

---

## Stack

| Layer | Tech | Cost |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Free |
| Styling | Tailwind CSS + framer-motion | Free |
| Backend API | Go + Gin | Free |
| LLM | Ollama (`llama3.2`) | Free — runs locally |
| MCP | `mark3labs/mcp-go` | Free |
| London data | TFL Open API | Free |
| French rail data | SNCF Navitia API | Free with registration |

---

## Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Ollama](https://ollama.com/)
- SNCF API key — register free at [numerique.sncf.com/startup/api](https://numerique.sncf.com/startup/api)

---

## Quick start

### 1 — Install Ollama and pull the model

```bash
brew install ollama        # macOS
# or: curl -fsSL https://ollama.com/install.sh | sh

ollama serve               # keep this running
ollama pull llama3.2       # ~2 GB, one-time download
```

### 2 — Configure API keys

Create a `.env` file in the project root:

```bash
# .env
TFL_APP_KEY=           # optional — free tier works without one
SNCF_API_KEY=your_key_here
```

> **TFL** — register at [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk/) for higher rate limits (optional).  
> **SNCF** — register at [numerique.sncf.com/startup/api](https://numerique.sncf.com/startup/api) to get a free API key.

### 3 — Start everything

```bash
make dev
```

This runs the MCP server, backend, and frontend in parallel.  
Open `http://localhost:3000` and start asking questions.

#### Manual start (alternative)

```bash
# Terminal 1 — MCP server
cd mcp-server
MCP_TRANSPORT=sse MCP_PORT=8081 SNCF_API_KEY=your_key go run .

# Terminal 2 — Backend
cd backend
go run .

# Terminal 3 — Frontend
cd frontend
npm install && npm run dev
```

---

## Environment variables

### MCP server

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Set to `sse` for HTTP mode |
| `MCP_PORT` | `8081` | SSE server port |
| `TFL_APP_KEY` | _(none)_ | Optional TFL API key for higher rate limits |
| `SNCF_API_KEY` | _(required)_ | SNCF Navitia API key |

### Backend

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama base URL |
| `OLLAMA_MODEL` | `llama3.2` | Model name |
| `MCP_URL` | `http://localhost:8081/sse` | MCP server SSE endpoint |
| `PORT` | `8080` | Backend port |

---

## MCP tools

### TFL (London)

| Tool | TFL endpoint | What it does |
|---|---|---|
| `plan_journey` | `/Journey/JourneyResults/{from}/to/{to}` | Journey planning with legs, times, fares |
| `get_line_status` | `/Line/{ids}/Status` | Status for specific lines by ID |
| `get_status_by_mode` | `/Line/Mode/{mode}/Status` | Status for all lines of a transport mode |
| `search_stops` | `/StopPoint/Search` | Find stations and stops by name |

### SNCF (France)

| Tool | SNCF endpoint | What it does |
|---|---|---|
| `plan_sncf_journey` | `/journeys` | Plan a train journey between two French stations |
| `search_sncf_stations` | `/places` | Find SNCF stations by name |
| `get_sncf_disruptions` | `/disruptions` | Active disruptions on the French rail network |

> **Raw API responses** are saved as pretty-printed JSON to `mcp-server/responses/` whenever SNCF tools are called — useful for debugging.

---

## Example conversations

### London (TFL)

```
You:       How do I get from King's Cross to Canary Wharf?
Assistant: [calls plan_journey]
           Option 1 — 28 min
             Take Jubilee line from King's Cross St. Pancras
             Alight at Canary Wharf

You:       Any problems on the tube right now?
Assistant: [calls get_status_by_mode with mode=tube]
           ✓ Bakerloo: Good Service
           ✓ Central: Good Service
           ⚠ District: Minor Delays — Signal failure at Earls Court
```

### France (SNCF)

```
You:       Plan a train from Paris to Lyon tomorrow at 9am
Assistant: [calls search_sncf_stations, then plan_sncf_journey]
           Option 1 — 1h 58min, 0 transfers
             TGV INOUI — departs Paris Gare de Lyon 09:00
             Arrives Lyon Part-Dieu 10:58

You:       Any rail disruptions in France today?
Assistant: [calls get_sncf_disruptions]
           ⚠ TER Auvergne-Rhône-Alpes: Strike action — reduced service
             Affected: Lyon ↔ Grenoble corridor
             Until: 18:00 today
```

---

## Project structure

```
tfl-llm-sample/
├── .env                 # API keys (gitignored)
├── Makefile             # make dev — starts all 3 services
│
├── mcp-server/          # Go — MCP server exposing TFL + SNCF tools
│   ├── main.go          # Server entrypoint, stdio/SSE transport
│   ├── responses/       # Raw SNCF API responses (auto-saved, gitignored)
│   ├── tfl/
│   │   └── client.go    # TFL HTTP client
│   ├── sncf/
│   │   └── client.go    # SNCF Navitia HTTP client
│   └── tools/
│       ├── journey.go          # plan_journey (TFL)
│       ├── status.go           # get_line_status (TFL)
│       ├── status_by_mode.go   # get_status_by_mode (TFL)
│       ├── stops.go            # search_stops (TFL)
│       ├── sncf_journey.go     # plan_sncf_journey
│       ├── sncf_stations.go    # search_sncf_stations
│       └── sncf_disruptions.go # get_sncf_disruptions
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
        ├── App.tsx
        ├── hooks/useChat.ts        # SSE stream consumer + state
        └── components/
            ├── MessageBubble.tsx   # Rich rendering — journey cards,
            │                       # route diagrams, tube badges
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
┌──────────────────────────────────────────┐
│  LLM (Ollama) with TFL + SNCF tools      │
│                                          │
│  Streaming output:                       │
│  • text tokens → streamed to UI          │
│  • tool_calls  → captured + merged       │
└──────────┬───────────────────────────────┘
           │ tool_calls present?
    ┌──────▼──────┐
    │  YES        │  NO → return final answer
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────────┐
    │  Execute tool via MCP server        │
    │  → real TFL or SNCF API call        │
    │  → add result to messages           │
    └──────┬──────────────────────────────┘
           │
           └──── loop (max 5 rounds)
```

---

## Licence

MIT
