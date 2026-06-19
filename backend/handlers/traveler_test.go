package handlers

import "testing"

func TestParseTravelerSummaryText(t *testing.T) {
	raw := `TRAVELER_SUMMARY_START:2026-06-19|2
SERVICE_START:9022|420|Paris Nord|London St Pancras
CLASS:standard|291
CLASS:comfort|90
CLASS:premium|39
TYPE:normal|317
TYPE:senior|50
SERVICE_END
SERVICE_START:9031|150|London St Pancras|Brussels Midi
CLASS:standard|100
TYPE:normal|120
SERVICE_END
TRAVELER_SUMMARY_END`

	out := parseTravelerSummaryText(raw)
	if out == nil {
		t.Fatal("expected summary, got nil")
	}
	if out.Date != "2026-06-19" {
		t.Fatalf("expected date 2026-06-19, got %s", out.Date)
	}
	if out.Services != 2 {
		t.Fatalf("expected 2 services, got %d", out.Services)
	}
	if out.TotalPassengers != 570 {
		t.Fatalf("expected total 570, got %d", out.TotalPassengers)
	}
	if out.BusiestService != "9022" {
		t.Fatalf("expected busiest 9022, got %s", out.BusiestService)
	}
	if out.PeakLoad != 420 {
		t.Fatalf("expected peak 420, got %d", out.PeakLoad)
	}
	if got := out.Items[0].Classes["premium"]; got != 39 {
		t.Fatalf("expected premium 39, got %d", got)
	}
	if got := out.Items[0].Types["senior"]; got != 50 {
		t.Fatalf("expected senior 50, got %d", got)
	}
}
