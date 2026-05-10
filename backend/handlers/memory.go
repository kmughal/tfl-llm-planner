package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"tfl-backend/memory"
)

type MemoryHandler struct {
	store memory.Store
}

func NewMemoryHandler(store memory.Store) *MemoryHandler {
	return &MemoryHandler{store: store}
}

// FlushMemory handles DELETE /api/memory/:sessionId
// Removes all stored memories for the given session (one user's full history).
func (h *MemoryHandler) FlushMemory(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId required"})
		return
	}
	if err := h.store.Flush(c.Request.Context(), sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
