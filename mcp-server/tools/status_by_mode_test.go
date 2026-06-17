package tools

import "testing"

func TestNormalizeModes(t *testing.T) {
	got := normalizeModes("tube,dler,overground,elizabeth line")
	if got != "tube,dlr,overground,elizabeth-line" {
		t.Fatalf("normalizeModes = %q", got)
	}
}
