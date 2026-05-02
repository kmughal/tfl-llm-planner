package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"tfl-backend/logger"
)

// LogStream handles GET /api/logs/stream — SSE stream of log entries.
// On connect it replays the last ringSize entries, then streams live.
func LogStream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	ch, history := logger.Global.Subscribe()
	defer logger.Global.Unsubscribe(ch)

	flusher, canFlush := c.Writer.(http.Flusher)

	write := func(e logger.Entry) {
		b, _ := json.Marshal(e)
		fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		if canFlush {
			flusher.Flush()
		}
	}

	// Replay history so the page is populated immediately on connect.
	for _, e := range history {
		write(e)
	}

	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-ch:
			write(e)
		}
	}
}
