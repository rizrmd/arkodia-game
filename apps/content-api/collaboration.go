package main

// The same database transaction owns leases, content, field provenance, audit,
// and replay events. No in-memory mutex is used as a correctness boundary.
import (
	contracts "arkodia/game/packages/content-contracts"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

type collabLease struct {
	User    string `json:"user"`
	Session string `json:"session"`
	Token   int64  `json:"token"`
	Expires int64  `json:"expires"`
}
type collabPresence struct {
	Preview        map[string]any `json:"preview,omitempty"`
	PreviewExpires int64          `json:"previewExpires,omitempty"`
	User           string         `json:"user"`
	Session        string         `json:"session"`
	Name           string         `json:"name"`
	Selection      string         `json:"selection"`
	Cursor         any            `json:"cursor,omitempty"`
	Expires        int64          `json:"expires"`
}
type collabChange struct {
	Path      []string         `json:"path"`
	Before    any              `json:"before"`
	After     any              `json:"after"`
	HadBefore bool             `json:"hadBefore"`
	HadAfter  bool             `json:"hadAfter"`
	Prior     map[string]int64 `json:"prior"`
}
type collabGroup struct {
	ID        string         `json:"id"`
	User      string         `json:"user"`
	Job       string         `json:"job,omitempty"`
	Scope     string         `json:"scope"`
	Label     string         `json:"label"`
	Stamp     int64          `json:"stamp"`
	Undone    int64          `json:"undone"`
	Discarded bool           `json:"discarded"`
	Changes   []collabChange `json:"changes"`
}
type collabState struct {
	Sequence int64                     `json:"sequence"`
	Fence    int64                     `json:"fence"`
	Versions map[string]int64          `json:"versions"`
	Leases   map[string]collabLease    `json:"leases"`
	Writers  map[string]int64          `json:"writers"`
	Groups   []collabGroup             `json:"groups"`
	Presence map[string]collabPresence `json:"presence"`
}
type collabRequest struct {
	Preview    map[string]any                 `json:"preview,omitempty"`
	Action     string                         `json:"action"`
	Actor      authoringActor                 `json:"actor"`
	Session    string                         `json:"session"`
	Name       string                         `json:"name"`
	Scope      string                         `json:"scope"`
	Label      string                         `json:"label"`
	GroupID    string                         `json:"groupId"`
	Resources  []string                       `json:"resources"`
	Tokens     map[string]int64               `json:"tokens"`
	Expected   map[string]int64               `json:"expectedEntityVersions"`
	Operations []contracts.AuthoringOperation `json:"operations"`
	Document   *contracts.AuthoringDocument   `json:"document,omitempty"`
	Selection  string                         `json:"selection"`
	Cursor     any                            `json:"cursor,omitempty"`
}

func newCollab() collabState {
	return collabState{Versions: map[string]int64{}, Leases: map[string]collabLease{}, Writers: map[string]int64{}, Groups: []collabGroup{}, Presence: map[string]collabPresence{}}
}
func collabLoad(ctx context.Context, db queryDB, id string) (collabState, bool, error) {
	s := newCollab()
	var raw []byte
	err := db.QueryRow(ctx, "SELECT body FROM content_collaboration WHERE document_id=$1", id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return s, false, nil
	}
	if err != nil {
		return s, false, err
	}
	err = json.Unmarshal(raw, &s)
	return s, true, err
}
func collabResource(op contracts.AuthoringOperation) string { return op.Domain + "/" + op.ID }
func validResource(k string) bool {
	parts := strings.Split(k, "/")
	return len(parts) == 2 && (parts[0] == "objects" || parts[0] == "environments") && identifier.MatchString(parts[1])
}
func pathKey(p []string) string { b, _ := json.Marshal(p); return string(b) }
func overlap(a, b []string) bool {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	return reflect.DeepEqual(a[:n], b[:n])
}
func related(w map[string]int64, p []string) map[string]int64 {
	result := map[string]int64{}
	for k, v := range w {
		var q []string
		json.Unmarshal([]byte(k), &q)
		if overlap(p, q) {
			result[k] = v
		}
	}
	return result
}
func restoreWriters(w map[string]int64, p []string, values map[string]int64) {
	for k := range related(w, p) {
		delete(w, k)
	}
	for k, v := range values {
		w[k] = v
	}
}
func fieldDiff(path []string, b any, hb bool, a any, ha bool) []collabChange {
	if hb == ha && reflect.DeepEqual(b, a) {
		return nil
	}
	bm, bok := b.(map[string]any)
	am, aok := a.(map[string]any)
	if hb && ha && bok && aok {
		keys := map[string]bool{}
		for k := range bm {
			keys[k] = true
		}
		for k := range am {
			keys[k] = true
		}
		names := []string{}
		for k := range keys {
			names = append(names, k)
		}
		sort.Strings(names)
		result := []collabChange{}
		for _, k := range names {
			bv, bh := bm[k]
			av, ah := am[k]
			result = append(result, fieldDiff(append(append([]string{}, path...), k), bv, bh, av, ah)...)
		}
		return result
	}
	return []collabChange{{Path: path, Before: b, After: a, HadBefore: hb, HadAfter: ha}}
}
func applyField(root map[string]any, c collabChange, forward bool) bool {
	m := root
	for _, k := range c.Path[:len(c.Path)-1] {
		next, ok := m[k].(map[string]any)
		if !ok {
			return false
		}
		m = next
	}
	value, exists := c.Before, c.HadBefore
	if forward {
		value, exists = c.After, c.HadAfter
	}
	key := c.Path[len(c.Path)-1]
	if exists {
		m[key] = value
	} else {
		delete(m, key)
	}
	return true
}
func genericDomains(doc contracts.AuthoringDocument) map[string]any {
	b, _ := json.Marshal(doc.Data.Domains)
	var root map[string]any
	json.Unmarshal(b, &root)
	return root
}
func setDomains(doc *contracts.AuthoringDocument, root map[string]any) {
	b, _ := json.Marshal(root)
	doc.Data.Domains = nil
	json.Unmarshal(b, &doc.Data.Domains)
	assets := map[string]bool{}
	for _, entities := range doc.Data.Domains {
		for _, e := range entities {
			for _, sha := range e.Assets {
				assets[sha] = true
			}
		}
	}
	doc.Assets = []string{}
	for sha := range assets {
		doc.Assets = append(doc.Assets, sha)
	}
	sort.Strings(doc.Assets)
}
func groupResources(g collabGroup) []string {
	keys := map[string]bool{}
	for _, c := range g.Changes {
		keys[c.Path[0]+"/"+c.Path[1]] = true
	}
	result := []string{}
	for k := range keys {
		result = append(result, k)
	}
	sort.Strings(result)
	return result
}
func canHistory(s collabState, g collabGroup, redo bool, session string, now int64) bool {
	for _, k := range groupResources(g) {
		if lease, ok := s.Leases[k]; ok && lease.Expires > now && lease.Session != session {
			return false
		}
	}
	for _, c := range g.Changes {
		expected := map[string]int64{pathKey(c.Path): g.Stamp}
		if redo {
			expected = c.Prior
		}
		if !reflect.DeepEqual(related(s.Writers, c.Path), expected) {
			return false
		}
	}
	return true
}
func collabPublic(s collabState, doc contracts.AuthoringDocument, revision int64, user, session string) map[string]any {
	now := time.Now().UnixMilli()
	leases := map[string]any{}
	people := []collabPresence{}
	groups := []any{}
	for k, l := range s.Leases {
		if l.Expires > now {
			token := int64(0)
			if l.Session == session && l.User == user {
				token = l.Token
			}
			leases[k] = map[string]any{"user": l.User, "session": l.Session, "expires": l.Expires, "token": token}
		}
	}
	for _, p := range s.Presence {
		if p.Expires > now {
			copyPreview := map[string]any{}
			for k, v := range p.Preview {
				copyPreview[k] = v
			}
			p.Preview = copyPreview
			if p.PreviewExpires <= now {
				p.Preview = nil
			}
			for k := range p.Preview {
				l := s.Leases[k]
				if l.Expires <= now || l.Session != p.Session {
					delete(p.Preview, k)
				}
			}
			people = append(people, p)
		}
	}
	for _, g := range s.Groups {
		groups = append(groups, map[string]any{"id": g.ID, "actor": map[string]string{"userId": g.User, "jobId": g.Job}, "scope": g.Scope, "label": g.Label, "undone": g.Undone > 0, "discarded": g.Discarded, "safe": canHistory(s, g, g.Undone > 0, session, now)})
	}
	return map[string]any{"initialized": true, "document": doc, "revision": revision, "sequence": s.Sequence, "versions": s.Versions, "leases": leases, "presence": people, "groups": groups}
}

// Multiplayer domains accept only forms the live Environment adapter understands.
// Legacy URLs remain valid; newly declared digests still pass the Content API asset checks.
func validateEnvironment(doc contracts.AuthoringDocument) error {
	for _, domain := range []string{"objects", "environments"} {
		for id, e := range doc.Data.Domains[domain] {
			format, _ := e.Data["format"].(string)
			legacy, _ := e.Data["legacyId"].(string)
			native, ok := e.Data["native"].(map[string]any)
			kind := strings.TrimSuffix(strings.TrimPrefix(format, "arkodia.environment."), ".v1")
			if !ok || legacy == "" || len(legacy) > 1000 || format != "arkodia.environment."+kind+".v1" || (domain == "objects" && kind != "definition") || (domain == "environments" && kind != "instance" && kind != "override" && kind != "settings") || id != fmt.Sprintf("%s-%x", kind, sha256.Sum256([]byte(legacy))) {
				return errors.New("unsupported_environment_entity")
			}
			if kind == "settings" {
				if legacy != "environment" || len(native) != 2 {
					return errors.New("invalid_environment_settings")
				}
				if _, ok := native["controls"].(map[string]any); !ok {
					return errors.New("invalid_environment_settings")
				}
				layers, ok := native["layerNames"].([]any)
				if !ok {
					return errors.New("invalid_environment_settings")
				}
				for _, layer := range layers {
					if name, ok := layer.(string); !ok || len(name) > 800 {
						return errors.New("invalid_environment_settings")
					}
				}
			}
			if kind != "settings" && native["id"] != legacy {
				return errors.New("environment_identity_mismatch")
			}
			if kind == "definition" {
				if _, ok := native["parts"].([]any); !ok {
					return errors.New("invalid_object_parts")
				}
				if _, ok := native["name"].(string); !ok {
					return errors.New("invalid_object_name")
				}
			}
			if kind == "override" || kind == "instance" {
				for _, field := range []string{"x", "y"} {
					if _, ok := native[field].(float64); !ok {
						return errors.New("invalid_environment_transform")
					}
				}
			}
		}
	}
	return nil
}

func (a *API) collaborationRead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	tx, err := a.begin(ctx)
	if err != nil {
		fail(w, 503, "database_error")
		return
	}
	defer tx.Rollback(ctx)
	s, enabled, err := collabLoad(ctx, tx, id)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	if !enabled {
		respond(w, 200, map[string]any{"initialized": false})
		return
	}
	var raw []byte
	var revision int64
	if tx.QueryRow(ctx, "SELECT revision,document FROM content_drafts WHERE id=$1", id).Scan(&revision, &raw) != nil {
		fail(w, 404, "draft_not_found")
		return
	}
	var doc contracts.AuthoringDocument
	json.Unmarshal(raw, &doc)
	result := collabPublic(s, doc, revision, r.URL.Query().Get("user"), r.URL.Query().Get("session"))
	after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	events := []any{}
	rows, err := tx.Query(ctx, "SELECT sequence,body FROM content_collaboration_events WHERE document_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 256", id, after)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	for rows.Next() {
		var sequence int64
		var body []byte
		rows.Scan(&sequence, &body)
		var e any
		json.Unmarshal(body, &e)
		events = append(events, e)
	}
	rows.Close()
	known, _ := strconv.ParseInt(r.URL.Query().Get("knownRevision"), 10, 64)
	if known == revision && r.URL.Query().Has("knownRevision") {
		delete(result, "document")
	}
	result["events"] = events
	result["reset"] = after > s.Sequence || int64(len(events)) < s.Sequence-after
	respond(w, 200, result)
}
func (a *API) collaborationWrite(w http.ResponseWriter, r *http.Request) {
	var in collabRequest
	if !decode(w, r, &in) {
		return
	}
	if !identifier.MatchString(in.Actor.UserID) || !identifier.MatchString(in.Session) || len(in.Name) > 200 || len(in.Label) > 800 || len(in.Scope) > 1100 || len(in.Resources) > 256 {
		fail(w, 400, "invalid_collaboration_request")
		return
	}
	if r.Header.Get("Idempotency-Key") == "" {
		fail(w, 428, "idempotency_key_required")
		return
	}
	ctx := r.Context()
	id := r.PathValue("id")
	tx, err := a.begin(ctx)
	if err != nil {
		fail(w, 503, "database_error")
		return
	}
	defer tx.Rollback(ctx)
	var raw []byte
	var revision int64
	if tx.QueryRow(ctx, "SELECT revision,document FROM content_drafts WHERE id=$1", id).Scan(&revision, &raw) != nil {
		fail(w, 404, "draft_not_found")
		return
	}
	var doc contracts.AuthoringDocument
	if json.Unmarshal(raw, &doc) != nil || doc.SchemaVersion != 3 {
		fail(w, 422, "not_authoring_project")
		return
	}
	s, enabled, err := collabLoad(ctx, tx, id)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	now := time.Now().UnixMilli()
	for k, p := range s.Presence {
		if p.Expires <= now {
			delete(s.Presence, k)
		}
	}
	for k, l := range s.Leases {
		if l.Expires <= now {
			delete(s.Leases, k)
		}
	}
	changed := false
	ops := []contracts.AuthoringOperation{}
	skipped := []string{}
	for _, k := range in.Resources {
		if !validResource(k) {
			fail(w, 400, "invalid_resource")
			return
		}
	}
	switch in.Action {
	case "initialize":
		if enabled {
			fail(w, 409, "already_initialized")
			return
		}
		if in.Document == nil || in.Document.Data.ProjectID != doc.Data.ProjectID || in.Document.Data.OrganizationID != doc.Data.OrganizationID {
			fail(w, 422, "invalid_migration")
			return
		}
		// Preserve other workspace domains. Environment and object definitions alone are migrated.
		for _, domain := range []string{"objects", "environments"} {
			doc.Data.Domains[domain] = in.Document.Data.Domains[domain]
			for key := range doc.Data.Domains[domain] {
				s.Versions[domain+"/"+key] = 1
			}
		}
		setDomains(&doc, genericDomains(doc))
		changed = true
	case "acquire", "renew", "release":
		if !enabled {
			fail(w, 409, "migration_required")
			return
		}
		if len(in.Resources) == 0 {
			fail(w, 400, "resources_required")
			return
		}
		for _, k := range in.Resources {
			l, ok := s.Leases[k]
			live := ok && l.Expires > now
			if in.Action == "acquire" {
				if live && (l.Session != in.Session || l.User != in.Actor.UserID) {
					fail(w, 423, "object_locked")
					return
				}
				if !live {
					s.Fence++
					l = collabLease{User: in.Actor.UserID, Session: in.Session, Token: s.Fence}
				}
				l.Expires = now + 15000
				s.Leases[k] = l
			} else {
				if !live || l.Session != in.Session || l.User != in.Actor.UserID || in.Tokens[k] != l.Token {
					fail(w, 409, "lease_lost")
					return
				}
				if in.Action == "release" {
					delete(s.Leases, k)
				} else {
					l.Expires = now + 15000
					s.Leases[k] = l
				}
			}
		}
	case "presence":
		if !enabled {
			fail(w, 409, "migration_required")
			return
		}
		if len(in.Selection) > 200 {
			fail(w, 400, "invalid_selection")
			return
		}
		if in.Cursor != nil {
			cursor, ok := in.Cursor.(map[string]any)
			if !ok || len(cursor) != 2 {
				fail(w, 400, "invalid_cursor")
				return
			}
			for _, field := range []string{"x", "y"} {
				if _, ok := cursor[field].(float64); !ok {
					fail(w, 400, "invalid_cursor")
					return
				}
			}
		}
		cb, _ := json.Marshal(in.Cursor)
		if len(cb) > 200 {
			fail(w, 400, "invalid_cursor")
			return
		}
		s.Presence[in.Session] = collabPresence{User: in.Actor.UserID, Session: in.Session, Name: in.Name, Selection: in.Selection, Cursor: in.Cursor, Expires: now + 15000}
	case "preview":
		if !enabled {
			fail(w, 409, "migration_required")
			return
		}
		if len(in.Preview) > 256 {
			fail(w, 400, "invalid_preview")
			return
		}
		for k, value := range in.Preview {
			l := s.Leases[k]
			if l.Expires <= now || l.Session != in.Session || l.User != in.Actor.UserID || in.Tokens[k] != l.Token {
				fail(w, 423, "lease_required")
				return
			}
			p, ok := value.(map[string]any)
			if !ok || len(p) != 3 {
				fail(w, 400, "invalid_preview")
				return
			}
			legacy, ok := p["id"].(string)
			if !ok || k != fmt.Sprintf("environments/override-%x", sha256.Sum256([]byte(legacy))) {
				fail(w, 400, "invalid_preview")
				return
			}
			for _, field := range []string{"x", "y"} {
				if _, ok := p[field].(float64); !ok {
					fail(w, 400, "invalid_preview")
					return
				}
			}
		}
		p := s.Presence[in.Session]
		p.User = in.Actor.UserID
		p.Session = in.Session
		p.Name = in.Name
		p.Preview = in.Preview
		p.PreviewExpires = now + 2000
		p.Expires = now + 15000
		s.Presence[in.Session] = p

	case "commit":
		if !enabled {
			fail(w, 409, "migration_required")
			return
		}
		if !identifier.MatchString(in.GroupID) || len(in.Operations) < 1 || len(in.Operations) > 256 || in.Scope == "" {
			fail(w, 400, "invalid_transaction")
			return
		}
		for _, g := range s.Groups {
			if g.ID == in.GroupID {
				fail(w, 409, "group_reused")
				return
			}
		}
		seen := map[string]bool{}
		for _, op := range in.Operations {
			k := collabResource(op)
			if !validResource(k) || seen[k] {
				fail(w, 422, "invalid_environment_operation")
				return
			}
			seen[k] = true
			l := s.Leases[k]
			if l.Expires <= now || l.Session != in.Session || l.User != in.Actor.UserID || l.Token != in.Tokens[k] {
				fail(w, 423, "lease_required")
				return
			}
			expected, ok := in.Expected[k]
			if !ok || expected != s.Versions[k] {
				fail(w, 409, "entity_version_conflict")
				return
			}
		}
		before := genericDomains(doc)
		for _, op := range in.Operations {
			if _, e := contracts.ApplyAuthoringOperation(&doc, op); e != nil {
				fail(w, 422, e.Error())
				return
			}
		}
		after := genericDomains(doc)
		group := collabGroup{ID: in.GroupID, User: in.Actor.UserID, Job: in.Actor.JobID, Scope: in.Scope, Label: in.Label, Stamp: s.Sequence + 1, Changes: fieldDiff(nil, before, true, after, true)}
		for i := range group.Changes {
			c := &group.Changes[i]
			c.Prior = related(s.Writers, c.Path)
			restoreWriters(s.Writers, c.Path, map[string]int64{pathKey(c.Path): group.Stamp})
		}
		for i := range s.Groups {
			if s.Groups[i].User == in.Actor.UserID && s.Groups[i].Undone > 0 {
				s.Groups[i].Discarded = true
			}
		}
		s.Groups = append(s.Groups, group)
		// Retain 50 undo units per actor and editing scope; the event audit is independent.
		count := 0
		for i := len(s.Groups) - 1; i >= 0; i-- {
			if s.Groups[i].User == in.Actor.UserID && s.Groups[i].Scope == in.Scope {
				count++
				if count > 50 {
					s.Groups = append(s.Groups[:i], s.Groups[i+1:]...)
				}
			}
		}
		ops = in.Operations
		changed = true
	case "undo", "redo":
		if !enabled {
			fail(w, 409, "migration_required")
			return
		}
		redo := in.Action == "redo"
		indices := []int{}
		for i, g := range s.Groups {
			if g.User == in.Actor.UserID && g.Scope == in.Scope && !g.Discarded && (g.Undone > 0) == redo {
				indices = append(indices, i)
			}
		}
		sort.Slice(indices, func(i, j int) bool {
			if redo {
				return s.Groups[indices[i]].Undone > s.Groups[indices[j]].Undone
			}
			return indices[i] > indices[j]
		})
		found := false
		for _, index := range indices {
			g := s.Groups[index]
			if !canHistory(s, g, redo, in.Session, now) {
				skipped = append(skipped, g.ID)
				continue
			}
			root := genericDomains(doc)
			ok := true
			changes := g.Changes
			if !redo {
				changes = append([]collabChange{}, changes...)
				for i, j := 0, len(changes)-1; i < j; i, j = i+1, j-1 {
					changes[i], changes[j] = changes[j], changes[i]
				}
			}
			for _, c := range changes {
				if !applyField(root, c, redo) {
					ok = false
					break
				}
			}
			candidate := doc
			setDomains(&candidate, root)
			encoded, _ := json.Marshal(candidate)
			if !ok {
				skipped = append(skipped, g.ID)
				continue
			}
			if e := validateEnvironment(candidate); e != nil {
				skipped = append(skipped, g.ID)
				continue
			}
			if _, e := a.validate(ctx, encoded); e != nil {
				skipped = append(skipped, g.ID)
				continue
			}
			for _, c := range g.Changes {
				writers := c.Prior
				if redo {
					writers = map[string]int64{pathKey(c.Path): g.Stamp}
				}
				restoreWriters(s.Writers, c.Path, writers)
			}
			for _, k := range groupResources(g) {
				parts := strings.SplitN(k, "/", 2)
				e, exists := candidate.Data.Domains[parts[0]][parts[1]]
				op := contracts.AuthoringOperation{Kind: "entity.remove", Domain: parts[0], ID: parts[1], Label: in.Action}
				if exists {
					op.Kind = "entity.put"
					op.Entity = &e
				}
				ops = append(ops, op)
			}
			doc = candidate
			if redo {
				s.Groups[index].Undone = 0
			} else {
				s.Groups[index].Undone = s.Sequence + 1
			}
			changed = true
			found = true
			break
		}
		if !found {
			result := collabPublic(s, doc, revision, in.Actor.UserID, in.Session)
			result["skipped"] = skipped
			result["notice"] = "No safe personal history remains"
			respond(w, 200, result)
			return
		}
	default:
		fail(w, 400, "invalid_collaboration_action")
		return
	}
	if changed {
		if e := validateEnvironment(doc); e != nil {
			fail(w, 422, e.Error())
			return
		}
		encoded, _ := json.Marshal(doc)
		if len(encoded) > 4<<20 {
			fail(w, 413, "document_too_large")
			return
		}
		if _, e := a.validate(ctx, encoded); e != nil {
			fail(w, 422, e.Error())
			return
		}
		tag, e := tx.Exec(ctx, "UPDATE content_drafts SET document=$1,revision=revision+1 WHERE id=$2 AND revision=$3", encoded, id, revision)
		if e != nil {
			fail(w, 409, "transaction_conflict_retry")
			return
		}
		n, _ := tag.RowsAffected()
		if n != 1 {
			fail(w, 409, "revision_conflict")
			return
		}
		revision++
		for key, p := range s.Presence {
			for _, op := range ops {
				delete(p.Preview, collabResource(op))
			}
			s.Presence[key] = p
		}
		for _, op := range ops {
			s.Versions[collabResource(op)]++
		}
	}
	s.Sequence++
	event := map[string]any{"sequence": s.Sequence, "revision": revision, "action": in.Action, "actor": in.Actor, "session": in.Session, "groupId": in.GroupID, "operations": ops}
	eb, _ := json.Marshal(event)
	sb, _ := json.Marshal(s)
	_, err = tx.Exec(ctx, "INSERT INTO content_collaboration(document_id,body) VALUES($1,$2) ON CONFLICT(document_id) DO UPDATE SET body=excluded.body", id, sb)
	if err == nil {
		_, err = tx.Exec(ctx, "INSERT INTO content_collaboration_events(document_id,sequence,body) VALUES($1,$2,$3)", id, s.Sequence, eb)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, 409, "transaction_conflict_retry")
		return
	}
	result := collabPublic(s, doc, revision, in.Actor.UserID, in.Session)
	// Lease/presence responses must not persist a complete multi-megabyte document
	// in the durable idempotency table for every heartbeat or drag preview.
	if !changed {
		delete(result, "document")
	}
	result["skipped"] = skipped
	respond(w, 200, result)
}

// Called from legacy transaction entrypoints so neither tools nor jobs can bypass leases.
func (a *API) collaborationEnabled(ctx context.Context, id string) bool {
	var exists bool
	err := a.query(ctx).QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM content_collaboration WHERE document_id=$1)", id).Scan(&exists)
	return err != nil || exists
}
