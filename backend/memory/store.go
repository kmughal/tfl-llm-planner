package memory

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"sync"
	"time"
)

// Store is the memory persistence interface.
// All operations are scoped to a sessionID so different users stay isolated.
// Swap the implementation for SQLite or Zep without touching callers.
type Store interface {
	// Upsert writes or overwrites a single memory entry identified by convID
	// within the given session.
	Upsert(ctx context.Context, sessionID, convID, content string) error

	// Retrieve returns up to limit memory entries for the session, newest first.
	Retrieve(ctx context.Context, sessionID string, limit int) ([]string, error)

	// Flush deletes all memory for the session (GDPR right-to-erasure / user reset).
	Flush(ctx context.Context, sessionID string) error

	Close() error
}

// entry is one stored memory record.
type entry struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	UpdatedAt int64  `json:"updatedAt"`
}

// FileStore persists memory to a JSON file.
// One entry per conversation (upserted by sessionID+convID), newest returned first.
type FileStore struct {
	mu   sync.RWMutex
	path string
	data map[string][]entry // sessionID → entries
}

// NewFileStore opens an existing store at path or creates a new one.
func NewFileStore(path string) (*FileStore, error) {
	s := &FileStore{path: path, data: make(map[string][]entry)}
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, &s.data)
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return s, nil
}

func (s *FileStore) Upsert(_ context.Context, sessionID, convID, content string) error {
	id := sessionID + ":" + convID
	now := time.Now().Unix()

	s.mu.Lock()
	defer s.mu.Unlock()

	entries := s.data[sessionID]
	updated := false
	for i, e := range entries {
		if e.ID == id {
			entries[i].Content = content
			entries[i].UpdatedAt = now
			updated = true
			break
		}
	}
	if !updated {
		entries = append(entries, entry{ID: id, Content: content, UpdatedAt: now})
	}
	s.data[sessionID] = entries
	return s.save()
}

func (s *FileStore) Retrieve(_ context.Context, sessionID string, limit int) ([]string, error) {
	s.mu.RLock()
	src := append([]entry(nil), s.data[sessionID]...)
	s.mu.RUnlock()

	sort.Slice(src, func(i, j int) bool { return src[i].UpdatedAt > src[j].UpdatedAt })

	out := make([]string, 0, limit)
	for _, e := range src {
		if len(out) >= limit {
			break
		}
		out = append(out, e.Content)
	}
	return out, nil
}

func (s *FileStore) Flush(_ context.Context, sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, sessionID)
	return s.save()
}

func (s *FileStore) Close() error { return nil }

// save writes the full data map to disk. Must be called with s.mu held for writing.
func (s *FileStore) save() error {
	b, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, b, 0o600)
}
