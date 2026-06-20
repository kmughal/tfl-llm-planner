#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
DATE="${1:-$(date +%F)}"
OUT_DIR="${OUT_DIR:-docs/test-responses/${DATE}}"

mkdir -p "${OUT_DIR}/eurostar" "${OUT_DIR}/tfl" "${OUT_DIR}/sncf" "${OUT_DIR}/national-rail" "${OUT_DIR}/paris" "${OUT_DIR}/operations" "${OUT_DIR}/meta"

fetch() {
  local path="$1"
  local output="$2"
  echo "→ ${path}"
  curl -sS "${BASE_URL}${path}" -o "${output}"
}

fetch "/api/services/status" "${OUT_DIR}/meta/services-status.json"

fetch "/api/eurostar/trains?date=${DATE}" "${OUT_DIR}/eurostar/trains-${DATE}.json"
fetch "/api/eurostar/catalog?date=${DATE}" "${OUT_DIR}/eurostar/catalog-${DATE}.json"
fetch "/api/eurostar/traveler-summary?date=${DATE}" "${OUT_DIR}/eurostar/traveler-summary-${DATE}.json"
fetch "/api/eurostar/watchlist?date=${DATE}" "${OUT_DIR}/eurostar/watchlist-${DATE}.json"
fetch "/api/crew/activities?date=${DATE}" "${OUT_DIR}/eurostar/crew-activities-${DATE}.json"

fetch "/api/tfl/command-center" "${OUT_DIR}/tfl/command-center.json"
fetch "/api/tfl/lines/central/crowding?lineName=Central" "${OUT_DIR}/tfl/crowding-central.json"
fetch "/api/buses" "${OUT_DIR}/tfl/bus-lines.json"
fetch "/api/buses/1/arrivals" "${OUT_DIR}/tfl/bus-arrivals-route-1.json"

fetch "/api/sncf/command-center" "${OUT_DIR}/sncf/command-center.json"
fetch "/api/national-rail/command-center" "${OUT_DIR}/national-rail/command-center.json"
fetch "/api/paris/command-center" "${OUT_DIR}/paris/command-center.json"
fetch "/api/operations/wall" "${OUT_DIR}/operations/wall.json"

echo ""
echo "Saved test responses to ${OUT_DIR}"
