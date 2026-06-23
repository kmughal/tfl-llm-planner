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

func TestSummarizeImmediateEurostarPlansPrefersNextActiveService(t *testing.T) {
	raw := "" +
		"PLAN_START:20260623-9028|commercial|9028|deleted|13:31|15:48\n" +
		"MAP_STATION:SPX|origin|0|0|13:31||London St Pancras\n" +
		"MAP_STATION:PNO|destination|0|0||15:48|Paris Gare du Nord\n" +
		"PLAN_END\n" +
		"PLAN_START:20260623-9032|commercial|9032|active|15:01|17:18\n" +
		"MAP_STATION:SPX|origin|0|0|15:01||London St Pancras\n" +
		"MAP_STATION:PNO|destination|0|0||17:18|Paris Gare du Nord\n" +
		"PLAN_END\n" +
		"PLAN_START:20260623-9040|commercial|9040|active|16:31|18:48\n" +
		"MAP_STATION:SPX|origin|0|0|16:31||London St Pancras\n" +
		"MAP_STATION:PNO|destination|0|0||18:48|Paris Gare du Nord\n" +
		"PLAN_END\n"

	got := summarizeImmediateEurostarPlans(raw)
	want := "The next Eurostar from London St Pancras to Paris Gare du Nord is service 9032 at 15:01, arriving at 17:18. There are 1 later matching services after that."
	if got != want {
		t.Fatalf("summarizeImmediateEurostarPlans = %q, want %q", got, want)
	}
}

func TestSummarizeImmediateEurostarPlansHandlesOnlyCancelledMatch(t *testing.T) {
	raw := "" +
		"PLAN_START:20260623-9028|commercial|9028|deleted|13:31|15:48\n" +
		"MAP_STATION:SPX|origin|0|0|13:31||London St Pancras\n" +
		"MAP_STATION:PNO|destination|0|0||15:48|Paris Gare du Nord\n" +
		"PLAN_END\n"

	got := summarizeImmediateEurostarPlans(raw)
	want := "The next Eurostar from London St Pancras to Paris Gare du Nord in this result is service 9028 at 13:31, but it is currently deleted."
	if got != want {
		t.Fatalf("summarizeImmediateEurostarPlans = %q, want %q", got, want)
	}
}
