package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var instanceUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[48][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

// One-time legacy mapping, byte-identical to runtime/editor. New instances use UUID v4.
func canonicalInstanceID(old string) string {
	if instanceUUID.MatchString(old) {
		return strings.ToLower(old)
	}
	sum := sha256.Sum256([]byte("arkodia.instance.v1\x00" + old))
	sum[6] = (sum[6] & 15) | 0x80
	sum[8] = (sum[8] & 63) | 0x80
	h := fmt.Sprintf("%x", sum[:16])
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

type instanceMigration map[string]string

func (m instanceMigration) collect(value any) {
	switch v := value.(type) {
	case []any:
		for _, x := range v {
			m.collect(x)
		}
	case map[string]any:
		data, _ := v["data"].(map[string]any)
		format, _ := data["format"].(string)
		if format == "arkodia.environment.override.v1" || format == "arkodia.environment.instance.v1" {
			old, _ := data["legacyId"].(string)
			if old != "" {
				id := canonicalInstanceID(old)
				m[old] = id
				kind := "override"
				key := id
				if format == "arkodia.environment.instance.v1" {
					kind = "instance"
					key = id
				}
				m[fmt.Sprintf("%s-%x", kind, sha256.Sum256([]byte(old)))] = key
				if native, ok := data["native"].(map[string]any); ok {
					if source, ok := native["source"].(string); ok && source != "" {
						m[source] = canonicalInstanceID(source)
					}
				}
			}
		}
		for _, x := range v {
			m.collect(x)
		}
	}
}

func (m instanceMigration) text(s string) string {
	if next, ok := m[s]; ok && (strings.HasPrefix(s, "override-") || strings.HasPrefix(s, "instance-")) {
		return next
	}
	for old, next := range m {
		if s == "environments/"+old {
			return "environments/" + next
		}
	}
	// Writer/prior provenance keys are JSON-encoded paths, not resource strings.
	if strings.HasPrefix(s, "[") {
		var path []any
		if json.Unmarshal([]byte(s), &path) == nil {
			b, _ := json.Marshal(m.rewrite(path))
			return string(b)
		}
	}
	return s
}
func (m instanceMigration) rewrite(value any) any {
	switch v := value.(type) {
	case string:
		if v == "arkodia.environment.override.v1" {
			return "arkodia.object.instance.v2"
		}
		return m.text(v)
	case []any:
		out := make([]any, len(v))
		instancePath := false
		for _, x := range v {
			if s, ok := x.(string); ok && instanceUUID.MatchString(m.text(s)) {
				instancePath = true
			}
		}
		for i, x := range v {
			if instancePath && x == "legacyId" {
				out[i] = "instanceId"
			} else {
				out[i] = m.rewrite(x)
			}
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for k, x := range v {
			out[m.text(k)] = m.rewrite(x)
		}
		if v["format"] == "arkodia.environment.override.v1" || v["format"] == "arkodia.environment.instance.v1" {
			old, _ := v["legacyId"].(string)
			id := canonicalInstanceID(old)
			if native, ok := out["native"].(map[string]any); ok {
				native["id"] = id
				if source, ok := native["source"].(string); ok && source != "" {
					native["source"] = canonicalInstanceID(source)
				}
			}
			if v["format"] == "arkodia.environment.override.v1" {
				out["format"] = "arkodia.object.instance.v2"
				out["instanceId"] = id
				delete(out, "legacyId")
			} else {
				out["legacyId"] = id
			}
		}
		if selection, ok := v["selection"].(string); ok {
			if id, known := m[selection]; known {
				out["selection"] = id
			}
		}
		// Field-level history may contain a scalar identity rather than a full entity.
		if path, ok := v["path"].([]any); ok && len(path) > 2 && path[2] == "environments" {
			last := path[len(path)-1]
			if last == "id" || last == "source" || last == "legacyId" {
				for _, key := range []string{"before", "after"} {
					if old, ok := v[key].(string); ok {
						if id, known := m[old]; known {
							out[key] = id
						}
					}
				}
			}
		}
		return out
	}
	return value
}

// Reject ambiguous input rather than silently overwriting an existing UUID entry.
func (m instanceMigration) checkKeys(value any) error {
	switch v := value.(type) {
	case []any:
		for _, x := range v {
			if err := m.checkKeys(x); err != nil {
				return err
			}
		}
	case map[string]any:
		seen := map[string]bool{}
		for k, x := range v {
			next := m.text(k)
			if seen[next] {
				return fmt.Errorf("instance migration key collision: %s", next)
			}
			seen[next] = true
			if err := m.checkKeys(x); err != nil {
				return err
			}
		}
	}
	return nil
}

// Migrate drafts and their mutable undo/collaboration state atomically. Published
// releases are immutable. Original bytes are retained for recovery and audit.
func (a *API) migrateInstanceIDs(ctx context.Context) error {
	tx, err := a.begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS content_instance_id_backups (document_id TEXT NOT NULL, source_table TEXT NOT NULL, row_key TEXT NOT NULL, body BLOB NOT NULL, PRIMARY KEY(document_id,source_table,row_key))`); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, "SELECT id FROM content_drafts WHERE kind='authoring-project'")
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	for _, id := range ids {
		type record struct {
			table, key string
			raw        []byte
			value      any
		}
		records := []record{}
		for _, table := range []string{"content_drafts", "content_authoring_history", "content_collaboration", "content_collaboration_events"} {
			query := "SELECT '',body FROM " + table + " WHERE document_id=$1"
			if table == "content_drafts" {
				query = "SELECT '',document FROM content_drafts WHERE id=$1"
			}
			if table == "content_collaboration_events" {
				query = "SELECT CAST(sequence AS TEXT),body FROM content_collaboration_events WHERE document_id=$1"
			}
			rs, e := tx.Query(ctx, query, id)
			if e != nil {
				return e
			}
			for rs.Next() {
				r := record{table: table}
				if e = rs.Scan(&r.key, &r.raw); e != nil {
					rs.Close()
					return e
				}
				if e = json.Unmarshal(r.raw, &r.value); e != nil {
					rs.Close()
					return e
				}
				records = append(records, r)
			}
			rs.Close()
		}
		mapping := instanceMigration{}
		for _, r := range records {
			mapping.collect(r.value)
		}
		if len(mapping) == 0 {
			continue
		}
		for _, r := range records {
			if e := mapping.checkKeys(r.value); e != nil {
				return e
			}
			next, e := json.Marshal(mapping.rewrite(r.value))
			if e != nil {
				return e
			}
			// Semantic comparison makes repeated startup a no-op, including retained history.
			if r.table == "content_drafts" {
				var value map[string]any
				if e = json.Unmarshal(next, &value); e != nil {
					return e
				}
				if e = contracts.ValidateAuthoring(value); e != nil {
					return fmt.Errorf("migrate %s: %w", id, e)
				}
			}
			before, _ := json.Marshal(r.value)
			if string(before) == string(next) {
				continue
			}
			if _, e = tx.Exec(ctx, "INSERT OR IGNORE INTO content_instance_id_backups(document_id,source_table,row_key,body) VALUES($1,$2,$3,$4)", id, r.table, r.key, r.raw); e != nil {
				return e
			}
			query := "UPDATE " + r.table + " SET body=$1 WHERE document_id=$2"
			if r.table == "content_drafts" {
				query = "UPDATE content_drafts SET document=$1,revision=revision+1 WHERE id=$2"
			}
			if r.table == "content_collaboration_events" {
				query += " AND sequence=$3"
				_, e = tx.Exec(ctx, query, next, id, r.key)
			} else {
				_, e = tx.Exec(ctx, query, next, id)
			}
			if e != nil {
				return e
			}
		}
	}
	return tx.Commit(ctx)
}
