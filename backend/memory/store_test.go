package memory

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFileStoreExpiresAndExcludesCurrentConversation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	store, err := newFileStore(path, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 6, 14, 12, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	if err := store.Upsert(context.Background(), "session", "old", "old memory"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(9 * time.Minute)
	if err := store.Upsert(context.Background(), "session", "current", "current memory"); err != nil {
		t.Fatal(err)
	}

	got, err := store.Retrieve(context.Background(), "session", "current", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "old memory" {
		t.Fatalf("retrieve = %#v", got)
	}

	now = now.Add(2 * time.Minute)
	got, err = store.Retrieve(context.Background(), "session", "", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "current memory" {
		t.Fatalf("expired retrieve = %#v", got)
	}
}

func TestFileStoreRecognizesLegacyConversationID(t *testing.T) {
	store, err := newFileStore(filepath.Join(t.TempDir(), "memory.json"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	store.data["session"] = []entry{{ID: "session:conversation", Content: "legacy", UpdatedAt: time.Now().Unix()}}
	got, err := store.Retrieve(context.Background(), "session", "conversation", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("legacy current conversation was not excluded: %#v", got)
	}
}

func TestFileStoreWritesAtomicallyWithPrivatePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "memory.json")
	store, err := newFileStore(path, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Upsert(context.Background(), "session", "conversation", "private"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("permissions = %o, want 600", got)
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".memory-*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary files left behind: %#v", matches)
	}
}

func TestNewFileStoreRejectsCorruptJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewFileStore(path); err == nil || !strings.Contains(err.Error(), "decode memory store") {
		t.Fatalf("error = %v", err)
	}
}

func TestNewFileStoreSecuresExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	if err := os.WriteFile(path, []byte("{}"), 0o644); err != nil { t.Fatal(err) }
	if _, err := NewFileStore(path); err != nil { t.Fatal(err) }
	info, err := os.Stat(path)
	if err != nil { t.Fatal(err) }
	if got := info.Mode().Perm(); got != 0o600 { t.Fatalf("permissions = %o, want 600", got) }
}

func TestFileStoreHonorsCancelledContext(t *testing.T) {
	store, err := newFileStore(filepath.Join(t.TempDir(), "memory.json"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := store.Upsert(ctx, "session", "conversation", "value"); !errors.Is(err, context.Canceled) {
		t.Fatalf("upsert error = %v", err)
	}
	if _, err := store.Retrieve(ctx, "session", "", 5); !errors.Is(err, context.Canceled) {
		t.Fatalf("retrieve error = %v", err)
	}
}

func TestFileStoreBoundsContentAndEntries(t *testing.T) {
	store, err := newFileStore(filepath.Join(t.TempDir(), "memory.json"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	store.now = func() time.Time { now = now.Add(time.Second); return now }
	for i := 0; i < maxEntriesPerSession+5; i++ {
		id := strings.Repeat("x", i+1)
		if err := store.Upsert(context.Background(), "session", id, strings.Repeat("a", maxContentBytes+100)); err != nil {
			t.Fatal(err)
		}
	}
	if got := len(store.data["session"]); got != maxEntriesPerSession {
		t.Fatalf("entries = %d", got)
	}
	for _, item := range store.data["session"] {
		if len(item.Content) > maxContentBytes {
			t.Fatalf("content length = %d", len(item.Content))
		}
	}
}
