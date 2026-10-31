package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

type authoringActor struct {
	UserID string `json:"userId"`
	JobID  string `json:"jobId,omitempty"`
}
type authoringStep struct {
	Forward contracts.AuthoringOperation `json:"forward"`
	Inverse contracts.AuthoringOperation `json:"inverse"`
}
type authoringGroup struct {
	ID    string          `json:"id"`
	Label string          `json:"label"`
	Actor authoringActor  `json:"actor"`
	Steps []authoringStep `json:"steps"`
}
type authoringHistory struct {
	Groups []authoringGroup `json:"groups"`
	Cursor int              `json:"cursor"`
}
type authoringRequest struct {
	Revision   int64                          `json:"revision"`
	GroupID    string                         `json:"groupId"`
	Label      string                         `json:"label"`
	Actor      authoringActor                 `json:"actor"`
	Action     string                         `json:"action"`
	Unit       string                         `json:"unit,omitempty"`
	Operations []contracts.AuthoringOperation `json:"operations,omitempty"`
}

func publicAuthoringHistory(h authoringHistory) map[string]any {
	groups := []any{}
	offset := 0
	for _, g := range h.Groups {
		labels := []string{}
		for _, step := range g.Steps {
			labels = append(labels, step.Forward.Label)
		}
		applied := h.Cursor - offset
		if applied < 0 {
			applied = 0
		}
		if applied > len(g.Steps) {
			applied = len(g.Steps)
		}
		groups = append(groups, map[string]any{"id": g.ID, "label": g.Label, "actor": g.Actor, "operations": labels, "applied": applied})
		offset += len(g.Steps)
	}
	return map[string]any{"groups": groups, "cursor": h.Cursor, "canUndo": h.Cursor > 0, "canRedo": h.Cursor < offset}
}
func (a *API) authoringHistory(w http.ResponseWriter, r *http.Request) {
	var kind string
	if err := a.query(r.Context()).QueryRow(r.Context(), "SELECT kind FROM content_drafts WHERE id=$1", r.PathValue("id")).Scan(&kind); errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "draft_not_found")
		return
	} else if err != nil {
		fail(w, 500, "database_error")
		return
	}
	if kind != "authoring-project" {
		fail(w, 422, "not_authoring_project")
		return
	}
	h := authoringHistory{Groups: []authoringGroup{}}
	var raw []byte
	err := a.query(r.Context()).QueryRow(r.Context(), "SELECT body FROM content_authoring_history WHERE document_id=$1", r.PathValue("id")).Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		fail(w, 500, "database_error")
		return
	}
	if err == nil && json.Unmarshal(raw, &h) != nil {
		fail(w, 500, "invalid_stored_history")
		return
	}
	respond(w, 200, publicAuthoringHistory(h))
}
func (a *API) authoringTransaction(w http.ResponseWriter, r *http.Request) {
	var in authoringRequest
	if !decode(w, r, &in) {
		return
	}
	multiplayer := a.collaborationEnabled(r.Context(), r.PathValue("id"))
	if multiplayer && in.Action != "validate" {
		fail(w, 409, "multiplayer_transaction_required")
		return
	}
	if multiplayer {
		for _, op := range in.Operations {
			if !validResource(collabResource(op)) {
				fail(w, 422, "invalid_environment_operation")
				return
			}
		}
	}
	if in.Revision < 1 || !identifier.MatchString(in.GroupID) || !identifier.MatchString(in.Actor.UserID) || (in.Actor.JobID != "" && !identifier.MatchString(in.Actor.JobID)) || len(in.Label) == 0 || len(in.Label) > 800 || (in.Action != "commit" && in.Action != "validate" && in.Action != "undo" && in.Action != "redo") || (in.Unit != "" && in.Unit != "group" && in.Unit != "operation") {
		fail(w, 400, "invalid_authoring_request")
		return
	}
	if r.Header.Get("Idempotency-Key") == "" {
		fail(w, 428, "idempotency_key_required")
		return
	}
	ctx := r.Context()
	tx, err := a.begin(ctx)
	if err != nil {
		fail(w, 503, "database_error")
		return
	}
	defer tx.Rollback(ctx)
	id := r.PathValue("id")
	var raw []byte
	var revision int64
	err = tx.QueryRow(ctx, "SELECT revision,document FROM content_drafts WHERE id=$1", id).Scan(&revision, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "draft_not_found")
		return
	}
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	if revision != in.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	var doc contracts.AuthoringDocument
	if json.Unmarshal(raw, &doc) != nil || doc.SchemaVersion != 3 {
		fail(w, 422, "not_authoring_project")
		return
	}
	h := authoringHistory{Groups: []authoringGroup{}}
	var stored []byte
	err = tx.QueryRow(ctx, "SELECT body FROM content_authoring_history WHERE document_id=$1", id).Scan(&stored)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		fail(w, 500, "database_error")
		return
	}
	if err == nil && json.Unmarshal(stored, &h) != nil {
		fail(w, 500, "invalid_stored_history")
		return
	}
	var seen bool
	if tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM content_authoring_events WHERE document_id=$1 AND request_id=$2)", id, in.GroupID).Scan(&seen) != nil {
		fail(w, 500, "database_error")
		return
	}
	if seen {
		fail(w, 409, "authoring_group_reused")
		return
	}
	if in.Action == "commit" || in.Action == "validate" {
		if len(in.Operations) < 1 || len(in.Operations) > 256 {
			fail(w, 400, "invalid_authoring_operations")
			return
		}
		group := authoringGroup{ID: in.GroupID, Label: in.Label, Actor: in.Actor, Steps: []authoringStep{}}
		for _, op := range in.Operations {
			inverse, e := contracts.ApplyAuthoringOperation(&doc, op)
			if e != nil {
				fail(w, 422, e.Error())
				return
			}
			group.Steps = append(group.Steps, authoringStep{op, inverse})
		}
		// A new edit discards redo, including the unapplied tail of a partially undone group.
		kept := []authoringGroup{}
		remaining := h.Cursor
		for _, g := range h.Groups {
			if remaining == 0 {
				break
			}
			n := len(g.Steps)
			if n > remaining {
				n = remaining
			}
			g.Steps = g.Steps[:n]
			kept = append(kept, g)
			remaining -= n
		}
		h.Groups = append(kept, group)
		h.Cursor += len(group.Steps)
		if len(h.Groups) > 50 {
			for _, g := range h.Groups[:len(h.Groups)-50] {
				h.Cursor -= len(g.Steps)
			}
			h.Groups = h.Groups[len(h.Groups)-50:]
		}
	} else {
		if len(in.Operations) != 0 {
			fail(w, 400, "unexpected_authoring_operations")
			return
		}
		steps := []authoringStep{}
		starts := []int{}
		ends := []int{}
		for _, g := range h.Groups {
			starts = append(starts, len(steps))
			steps = append(steps, g.Steps...)
			ends = append(ends, len(steps))
		}
		target := h.Cursor
		if in.Action == "undo" {
			if target == 0 {
				fail(w, 409, "nothing_to_undo")
				return
			}
			target--
			if in.Unit != "operation" {
				for i, end := range ends {
					if h.Cursor <= end {
						target = starts[i]
						break
					}
				}
			}
			for i := h.Cursor - 1; i >= target; i-- {
				if _, e := contracts.ApplyAuthoringOperation(&doc, steps[i].Inverse); e != nil {
					fail(w, 409, "authoring_history_conflict")
					return
				}
			}
		} else {
			if target == len(steps) {
				fail(w, 409, "nothing_to_redo")
				return
			}
			target++
			if in.Unit != "operation" {
				for _, end := range ends {
					if end > h.Cursor {
						target = end
						break
					}
				}
			}
			for i := h.Cursor; i < target; i++ {
				if _, e := contracts.ApplyAuthoringOperation(&doc, steps[i].Forward); e != nil {
					fail(w, 409, "authoring_history_conflict")
					return
				}
			}
		}
		h.Cursor = target
	}
	next, _ := json.Marshal(doc)
	if len(next) > 4<<20 {
		fail(w, 413, "document_too_large")
		return
	}
	// Includes schema, graph and persisted asset checks against this same transaction.
	if _, e := a.validate(ctx, next); e != nil {
		fail(w, 422, e.Error())
		return
	}
	if in.Action == "validate" {
		if multiplayer {
			if e := validateEnvironment(doc); e != nil {
				fail(w, 422, e.Error())
				return
			}
		}
		respond(w, 200, map[string]any{"id": id, "revision": revision, "document": doc, "valid": true})
		return
	}
	hb, _ := json.Marshal(h)
	actor, _ := json.Marshal(in.Actor)
	tag, err := tx.Exec(ctx, "UPDATE content_drafts SET document=$1,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=$2 AND revision=$3", []byte(next), id, revision)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	n, _ := tag.RowsAffected()
	if n != 1 {
		fail(w, 409, "revision_conflict")
		return
	}
	_, err = tx.Exec(ctx, "INSERT INTO content_authoring_history(document_id,body) VALUES($1,$2) ON CONFLICT(document_id) DO UPDATE SET body=excluded.body", id, hb)
	if err == nil {
		_, err = tx.Exec(ctx, "INSERT INTO content_authoring_events(document_id,request_id,revision,action,actor,label) VALUES($1,$2,$3,$4,$5,$6)", id, in.GroupID, revision+1, in.Action, actor, in.Label)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, 409, "transaction_conflict_retry")
		return
	}
	w.Header().Set("ETag", fmt.Sprintf(`"%d"`, revision+1))
	respond(w, 200, map[string]any{"id": id, "revision": revision + 1, "document": doc, "history": publicAuthoringHistory(h)})
}
