package memory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DefaultTTL           = 10 * time.Minute
	maxEntriesPerSession = 20
	maxContentBytes      = 4000
)

// Store is the memory persistence interface. All operations are session scoped.
type Store interface {
	Upsert(ctx context.Context, sessionID, convID, content string) error
	Retrieve(ctx context.Context, sessionID, excludeConvID string, limit int) ([]string, error)
	Flush(ctx context.Context, sessionID string) error
	Close() error
}

type entry struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	UpdatedAt int64  `json:"updatedAt"`
}

type FileStore struct {
	mu   sync.RWMutex
	path string
	ttl  time.Duration
	data map[string][]entry
	now  func() time.Time
}

// NewFileStore opens an existing store and enforces the application's ten-minute
// memory lifetime even when the browser timer cannot send its DELETE request.
func NewFileStore(path string) (*FileStore, error) {
	return newFileStore(path, DefaultTTL)
}

func newFileStore(path string, ttl time.Duration) (*FileStore, error) {
	s := &FileStore{path: path, ttl: ttl, data: make(map[string][]entry), now: time.Now}
	b, err := os.ReadFile(path)
	switch {
	case err == nil && len(strings.TrimSpace(string(b))) > 0:
		if err := json.Unmarshal(b, &s.data); err != nil {
			return nil, fmt.Errorf("decode memory store %s: %w", path, err)
		}
		if err := os.Chmod(path, 0o600); err != nil {
			return nil, fmt.Errorf("secure memory store %s: %w", path, err)
		}
	case err != nil && !os.IsNotExist(err):
		return nil, err
	}
	return s, nil
}

func (s *FileStore) Upsert(ctx context.Context, sessionID, convID, content string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	sessionID, convID, content = strings.TrimSpace(sessionID), strings.TrimSpace(convID), strings.TrimSpace(content)
	if sessionID == "" || convID == "" || content == "" {
		return errors.New("sessionID, convID and content are required")
	}
	if len(content) > maxContentBytes {
		content = content[:maxContentBytes]
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	entries := liveEntries(s.data[sessionID], now, s.ttl)
	updated := false
	for i := range entries {
		if entryMatchesConversation(entries[i].ID, sessionID, convID) {
			entries[i].ID = convID
			entries[i].Content = content
			entries[i].UpdatedAt = now.Unix()
			updated = true
			break
		}
	}
	if !updated {
		entries = append(entries, entry{ID: convID, Content: content, UpdatedAt: now.Unix()})
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].UpdatedAt > entries[j].UpdatedAt })
	if len(entries) > maxEntriesPerSession {
		entries = entries[:maxEntriesPerSession]
	}
	s.data[sessionID] = entries
	return s.saveLocked(ctx)
}

func (s *FileStore) Retrieve(ctx context.Context, sessionID, excludeConvID string, limit int) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if limit <= 0 || strings.TrimSpace(sessionID) == "" {
		return []string{}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	entries := liveEntries(s.data[sessionID], s.now(), s.ttl)
	if len(entries) != len(s.data[sessionID]) {
		if len(entries) == 0 {
			delete(s.data, sessionID)
		} else {
			s.data[sessionID] = entries
		}
		if err := s.saveLocked(ctx); err != nil {
			return nil, err
		}
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].UpdatedAt > entries[j].UpdatedAt })
	out := make([]string, 0, min(limit, len(entries)))
	for _, item := range entries {
		if excludeConvID != "" && entryMatchesConversation(item.ID, sessionID, excludeConvID) {
			continue
		}
		out = append(out, item.Content)
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (s *FileStore) Flush(ctx context.Context, sessionID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, strings.TrimSpace(sessionID))
	return s.saveLocked(ctx)
}

func (s *FileStore) Close() error { return nil }

func liveEntries(entries []entry, now time.Time, ttl time.Duration) []entry {
	if ttl <= 0 {
		return append([]entry(nil), entries...)
	}
	cutoff := now.Add(-ttl).Unix()
	live := make([]entry, 0, len(entries))
	for _, item := range entries {
		if item.UpdatedAt >= cutoff {
			live = append(live, item)
		}
	}
	return live
}

func entryMatchesConversation(id, sessionID, convID string) bool {
	return id == convID || id == sessionID+":"+convID
}

// saveLocked atomically replaces the store and always restores private file permissions.
func (s *FileStore) saveLocked(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".memory-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		return err
	}
	return os.Chmod(s.path, 0o600)
}
