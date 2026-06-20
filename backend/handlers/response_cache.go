package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type responseSnapshot struct {
	Status   int             `json:"status"`
	CachedAt string          `json:"cachedAt"`
	Body     json.RawMessage `json:"body"`
}

type responseCacheStore struct {
	mu  sync.RWMutex
	dir string
}

var responseCache = &responseCacheStore{}

func InitResponseCache(dir string) error {
	responseCache.mu.Lock()
	defer responseCache.mu.Unlock()
	responseCache.dir = dir
	return os.MkdirAll(dir, 0755)
}

var unsafePathChars = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func sanitizePathSegment(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, " ", "-")
	value = unsafePathChars.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-._")
	if value == "" {
		return "default"
	}
	return value
}

func snapshotPathFor(key string) string {
	parts := strings.Split(strings.Trim(key, "/"), "/")
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		clean = append(clean, sanitizePathSegment(part))
	}
	if len(clean) == 0 {
		clean = []string{"default"}
	}
	clean[len(clean)-1] += ".json"
	return filepath.Join(append([]string{responseCache.dir}, clean...)...)
}

func writeSnapshot(key string, status int, body []byte) error {
	responseCache.mu.RLock()
	dir := responseCache.dir
	responseCache.mu.RUnlock()
	if dir == "" {
		return nil
	}
	snapshot := responseSnapshot{
		Status:   status,
		CachedAt: time.Now().UTC().Format(time.RFC3339),
		Body:     append([]byte(nil), body...),
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	target := snapshotPathFor(key)
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return err
	}
	return os.WriteFile(target, payload, 0644)
}

func readSnapshot(key string) (responseSnapshot, error) {
	body, err := os.ReadFile(snapshotPathFor(key))
	if err != nil {
		return responseSnapshot{}, err
	}
	var snapshot responseSnapshot
	if err := json.Unmarshal(body, &snapshot); err != nil {
		return responseSnapshot{}, err
	}
	return snapshot, nil
}

func respondJSONAndCache(c *gin.Context, key string, status int, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to encode response"})
		return
	}
	_ = writeSnapshot(key, status, body)
	c.Header("X-Response-Stale", "false")
	c.Header("X-Response-Source", "realtime")
	c.Header("X-Response-Cache-Key", key)
	c.Data(status, "application/json", body)
}

func respondWithCachedSnapshot(c *gin.Context, key, reason string) bool {
	snapshot, err := readSnapshot(key)
	if err != nil {
		return false
	}
	c.Header("X-Response-Stale", "true")
	c.Header("X-Response-Source", "cached-fallback")
	c.Header("X-Response-Cached-At", snapshot.CachedAt)
	c.Header("X-Response-Cache-Key", key)
	c.Header("X-Response-Stale-Reason", reason)
	c.Data(snapshot.Status, "application/json", snapshot.Body)
	return true
}
