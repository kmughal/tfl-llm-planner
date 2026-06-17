package handlers

import "testing"

func TestSummarizeRoadsResult(t *testing.T) {
	raw := "ROADS_START:24|23|1\nROAD:a1|A1|Good|No exceptional delays||\nROADS_END\n\nHINT: ignored"
	got := summarizeRoadsResult(raw)
	want := "TfL is reporting 24 managed roads, with 23 clear and 1 currently showing issues."
	if got != want {
		t.Fatalf("summarizeRoadsResult = %q, want %q", got, want)
	}
}

func TestSummarizeRoadDisruptionsResult(t *testing.T) {
	raw := "ROAD_DISRUPTIONS_START:a40|A40|2|1\nROAD_DISRUPTIONS_END\n\nHINT: ignored"
	got := summarizeRoadDisruptionsResult(raw)
	want := "A40 currently has 2 active disruptions, including 1 closure-related issue."
	if got != want {
		t.Fatalf("summarizeRoadDisruptionsResult = %q, want %q", got, want)
	}
}
