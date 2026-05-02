package logger

import (
	"fmt"
	"sync"
	"time"
)

// Level and Tag are plain string constants — no iota so they serialise cleanly to JSON.
type Level = string
type Tag   = string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
	LevelDebug Level = "debug"
)

const (
	TagSystem Tag = "system"
	TagHTTP   Tag = "http"
	TagLLM    Tag = "llm"
	TagTool   Tag = "tool"
	TagMCP    Tag = "mcp"
)

// Entry is a single log line sent over SSE to the frontend.
type Entry struct {
	ID    string `json:"id"`
	TS    string `json:"ts"`
	Level Level  `json:"level"`
	Tag   Tag    `json:"tag"`
	Msg   string `json:"msg"`
	Data  string `json:"data,omitempty"`
}

const ringSize = 500

// Broadcaster fans out log entries to all connected SSE subscribers and
// keeps the last ringSize entries so late-joiners see recent history.
type Broadcaster struct {
	mu   sync.Mutex
	seq  int64
	buf  []Entry
	subs map[chan Entry]struct{}
}

// Global is the process-wide broadcaster — import and call logger.Info / logger.Error etc.
var Global = &Broadcaster{subs: make(map[chan Entry]struct{})}

func (b *Broadcaster) emit(level Level, tag Tag, msg, data string) {
	b.mu.Lock()
	b.seq++
	e := Entry{
		ID:    fmt.Sprintf("%d", b.seq),
		TS:    time.Now().UTC().Format("15:04:05.000"),
		Level: level,
		Tag:   tag,
		Msg:   msg,
		Data:  data,
	}
	b.buf = append(b.buf, e)
	if len(b.buf) > ringSize {
		b.buf = b.buf[1:]
	}
	chans := make([]chan Entry, 0, len(b.subs))
	for ch := range b.subs {
		chans = append(chans, ch)
	}
	b.mu.Unlock()

	for _, ch := range chans {
		select {
		case ch <- e:
		default: // drop if subscriber can't keep up
		}
	}
}

// Subscribe returns a channel for live entries plus a snapshot of the history buffer.
func (b *Broadcaster) Subscribe() (chan Entry, []Entry) {
	ch := make(chan Entry, 128)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	history := make([]Entry, len(b.buf))
	copy(history, b.buf)
	b.mu.Unlock()
	return ch, history
}

// Unsubscribe removes a subscriber channel.
func (b *Broadcaster) Unsubscribe(ch chan Entry) {
	b.mu.Lock()
	delete(b.subs, ch)
	b.mu.Unlock()
}

// Package-level helpers — preferred API.
func Info(tag Tag, msg, data string)  { Global.emit(LevelInfo, tag, msg, data) }
func Warn(tag Tag, msg, data string)  { Global.emit(LevelWarn, tag, msg, data) }
func Error(tag Tag, msg, data string) { Global.emit(LevelError, tag, msg, data) }
func Debug(tag Tag, msg, data string) { Global.emit(LevelDebug, tag, msg, data) }
