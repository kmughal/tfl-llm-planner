package handlers

import (
	"bufio"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// ConfigLine represents one parsed line from the .env file.
type ConfigLine struct {
	LineType string `json:"type"`  // "section" | "blank" | "entry" | "commented_entry"
	Key      string `json:"key,omitempty"`
	Value    string `json:"value,omitempty"`
	Label    string `json:"label,omitempty"`
}

func parseEnvFile(path string) ([]ConfigLine, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var lines []ConfigLine
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		raw := scanner.Text()
		trimmed := strings.TrimSpace(raw)

		if trimmed == "" {
			lines = append(lines, ConfigLine{LineType: "blank"})
			continue
		}

		if strings.HasPrefix(trimmed, "#") {
			rest := strings.TrimSpace(trimmed[1:])
			// Detect commented-out key=value (e.g. "# OLLAMA_URL=http://...")
			if idx := strings.IndexByte(rest, '='); idx > 0 {
				key := strings.TrimSpace(rest[:idx])
				if isEnvVarName(key) {
					lines = append(lines, ConfigLine{
						LineType: "commented_entry",
						Key:      key,
						Value:    rest[idx+1:],
					})
					continue
				}
			}
			lines = append(lines, ConfigLine{LineType: "section", Label: rest})
			continue
		}

		if idx := strings.IndexByte(trimmed, '='); idx > 0 {
			key := strings.TrimSpace(trimmed[:idx])
			lines = append(lines, ConfigLine{LineType: "entry", Key: key, Value: trimmed[idx+1:]})
			continue
		}

		lines = append(lines, ConfigLine{LineType: "section", Label: trimmed})
	}

	return lines, scanner.Err()
}

func isEnvVarName(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, c := range s {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}

// GetConfig handles GET /api/config — returns the parsed .env lines.
func GetConfig(envPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		lines, err := parseEnvFile(envPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"lines": lines})
	}
}

type UpdateEntry struct {
	Value  string `json:"value"`
	Active bool   `json:"active"`
}

// UpdateConfig handles POST /api/config — applies key→{value,active} updates and rewrites the file.
func UpdateConfig(envPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req map[string]UpdateEntry
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		lines, err := parseEnvFile(envPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for i, line := range lines {
			if line.Key == "" {
				continue
			}
			if upd, ok := req[line.Key]; ok {
				lines[i].Value = upd.Value
				if upd.Active {
					lines[i].LineType = "entry"
				} else {
					lines[i].LineType = "commented_entry"
				}
			}
		}

		var sb strings.Builder
		for _, line := range lines {
			switch line.LineType {
			case "blank":
				sb.WriteString("\n")
			case "section":
				if line.Label != "" {
					sb.WriteString("# " + line.Label + "\n")
				} else {
					sb.WriteString("#\n")
				}
			case "entry":
				sb.WriteString(line.Key + "=" + line.Value + "\n")
			case "commented_entry":
				sb.WriteString("# " + line.Key + "=" + line.Value + "\n")
			}
		}

		if err := os.WriteFile(envPath, []byte(sb.String()), 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
