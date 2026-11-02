package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"context"
	"encoding/json"
	"testing"
)

func TestInstanceMigrationPreservesCollaborationHistory(t *testing.T) {
	f := newMultiplayer(t)
	// An ordinary edit creates field provenance, a live lease and undo history.
	lock := f.acquire("u1", "s1", "a")
	f.commit("u1", "s1", "move-a", multiOp("a", 42, 7), lock, 200)
	ctx := context.Background()
	if err := f.api.migrateInstanceIDs(ctx); err != nil {
		t.Fatal(err)
	}
	id := canonicalInstanceID("a")
	state := f.read("u1", "s1")
	docBytes, _ := json.Marshal(state["document"])
	var doc contracts.AuthoringDocument
	json.Unmarshal(docBytes, &doc)
	e, ok := doc.Data.Domains["environments"][id]
	if !ok || e.Data["instanceId"] != id || e.Data["format"] != "arkodia.object.instance.v2" {
		t.Fatalf("missing canonical entity: %s", docBytes)
	}
	if err := validateEnvironment(doc); err != nil {
		t.Fatal(err)
	}
	if _, ok := doc.Data.Domains["environments"][multiID("a")]; ok {
		t.Fatal("old entity retained")
	}
	// Undo and redo use migrated paths and writer stamps, not the old hashed key.
	f.command("u1", "s1", map[string]any{"action": "undo", "groupId": "move-a"}, 200)
	f.command("u1", "s1", map[string]any{"action": "redo", "groupId": "move-a"}, 200)
	var raw []byte
	f.api.DB.QueryRow("SELECT document FROM content_drafts WHERE id='project'").Scan(&raw)
	json.Unmarshal(raw, &doc)
	native := doc.Data.Domains["environments"][id].Data["native"].(map[string]any)
	if native["x"] != float64(42) {
		t.Fatalf("lost edit: %v", native)
	}
	var backups int
	f.api.DB.QueryRow("SELECT count(*) FROM content_instance_id_backups").Scan(&backups)
	if backups < 3 {
		t.Fatalf("missing backups: %d", backups)
	}
	var before int64
	f.api.DB.QueryRow("SELECT revision FROM content_drafts WHERE id='project'").Scan(&before)
	if err := f.api.migrateInstanceIDs(ctx); err != nil {
		t.Fatal(err)
	}
	var after int64
	f.api.DB.QueryRow("SELECT revision FROM content_drafts WHERE id='project'").Scan(&after)
	if before != after {
		t.Fatalf("not idempotent: %d -> %d", before, after)
	}
}

func TestCanonicalInstanceIDParity(t *testing.T) {
	if got := canonicalInstanceID("environment-object:/assets/moss.png:1:2:3"); got != "78d0b96b-aad1-848f-a6a8-ebde80dbfd9a" {
		t.Fatalf("cross-language identity mismatch: %s", got)
	}
	uuid := "6dc87919-427e-4e36-a098-170bc835a342"
	if canonicalInstanceID(uuid) != uuid {
		t.Fatal("existing UUID changed")
	}
}

func TestInstanceMigrationDoesNotRenameDefinitionsOrAssetPaths(t *testing.T) {
	old := "tree"
	op := multiOp(old, 1, 2)
	mapping := instanceMigration{}
	mapping.collect(map[string]any{"entity": map[string]any{"id": op.ID, "data": op.Entity.Data}})
	definition := map[string]any{"id": "definition-key", "data": map[string]any{"format": "arkodia.environment.definition.v1", "legacyId": old, "native": map[string]any{"id": old, "image": "/assets/tree.png"}}}
	migrated := mapping.rewrite(definition).(map[string]any)["data"].(map[string]any)
	if migrated["legacyId"] != old || migrated["native"].(map[string]any)["id"] != old {
		t.Fatal("definition identity changed")
	}
	if migrated["native"].(map[string]any)["image"] != "/assets/tree.png" {
		t.Fatal("asset path changed")
	}
	collision := map[string]any{op.ID: 1, canonicalInstanceID(old): 2}
	if mapping.checkKeys(collision) == nil {
		t.Fatal("ambiguous migration silently overwrites data")
	}
}

func TestCanonicalInstanceCommitAfterMigration(t *testing.T) {
	f := newMultiplayer(t)
	if err := f.api.migrateInstanceIDs(context.Background()); err != nil {
		t.Fatal(err)
	}
	id := canonicalInstanceID("a")
	resource := "environments/" + id
	lock := f.command("u1", "s1", map[string]any{"action": "acquire", "resources": []string{resource}}, 200)
	lease := lock["leases"].(map[string]any)[resource].(map[string]any)
	op := multiOp("a", 11, 22)
	op.ID = id
	op.Entity.ID = id
	op.Entity.Data = map[string]any{"format": "arkodia.object.instance.v2", "instanceId": id, "native": map[string]any{"id": id, "x": float64(11), "y": float64(22)}}
	f.command("u1", "s1", map[string]any{"action": "commit", "groupId": "uuid-edit", "label": "Move", "scope": "Environment", "operations": []contracts.AuthoringOperation{op}, "tokens": map[string]any{resource: lease["token"]}, "expectedEntityVersions": map[string]any{resource: lock["versions"].(map[string]any)[resource]}}, 200)
	result := f.command("old", "old-tab", map[string]any{"action": "commit", "operations": []contracts.AuthoringOperation{multiOp("a", 5, 6)}}, 409)
	if result["error"] != "legacy_instance_id_reload_required" {
		t.Fatalf("old client not rejected explicitly: %v", result)
	}
	f.command("u1", "s1", map[string]any{"action": "undo", "groupId": "uuid-edit"}, 200)
	f.command("u1", "s1", map[string]any{"action": "redo", "groupId": "uuid-edit"}, 200)
}
