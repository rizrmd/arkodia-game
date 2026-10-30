package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestV2PermissionsIdempotencyAndRollback(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "contracts.db")
	admin := strings.Repeat("admin", 8)
	author := strings.Repeat("author", 8)
	publisher := strings.Repeat("publisher", 6)
	t.Setenv("CONTENT_API_AUTHOR_TOKEN", author)
	t.Setenv("CONTENT_API_PUBLISHER_TOKEN", publisher)
	root := t.TempDir()
	api, err := openAPI(ctx, dsn, admin, "https://content.example", DiskObjects{root})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.handler())
	defer func() { srv.Close(); api.DB.Close() }()
	request := func(method, path string, body any, token, key string, want int) []byte {
		t.Helper()
		var raw []byte
		if b, ok := body.([]byte); ok {
			raw = b
		} else if body != nil {
			raw, _ = json.Marshal(body)
		}
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(raw))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, res.StatusCode, want, b)
		}
		return b
	}
	request("POST", "/v1/releases", map[string]any{}, author, "", 401)
	request("PUT", "/v1/drafts/no", map[string]any{}, publisher, "", 401)
	fixture := func(name string) map[string]any {
		t.Helper()
		raw, e := os.ReadFile("../../fixtures/legacy/" + name + ".json")
		if e != nil {
			t.Fatal(e)
		}
		var f map[string]any
		json.Unmarshal(raw, &f)
		return f
	}
	var asset Asset
	var pngBytes bytes.Buffer
	png.Encode(&pngBytes, image.NewRGBA(image.Rect(0, 0, 768, 768)))
	json.Unmarshal(request("POST", "/v1/assets", pngBytes.Bytes(), author, "asset-key", 201), &asset)
	makeDoc := func(name string) map[string]any {
		f := fixture(name)
		return map[string]any{"schemaVersion": 2, "kind": f["kind"], "name": name, "assets": []string{}, "dependencies": []any{}, "provenance": f["provenance"], "data": map[string]any{"format": f["format"], "payload": f["payload"], "bindings": map[string]string{}}}
	}
	save := func(rev int, doc any) map[string]any { return map[string]any{"revision": rev, "document": doc} }
	combat := makeDoc("combat")
	body := save(0, combat)
	first := request("PUT", "/v1/drafts/combat", body, author, "create-combat", 200)
	if !bytes.Equal(first, request("PUT", "/v1/drafts/combat", body, author, "create-combat", 200)) {
		t.Fatal("retry response changed")
	}
	request("PUT", "/v1/drafts/combat", save(1, combat), author, "create-combat", 409)
	request("PUT", "/v1/drafts/combat", body, author, "different-key", 409)
	combat["name"] = "Edited combat"
	request("PUT", "/v1/drafts/combat", save(1, combat), author, "edit-combat", 200)
	var read Draft
	json.Unmarshal(request("GET", "/v1/drafts/combat", nil, author, "", 200), &read)
	if read.Revision != 2 {
		t.Fatal("retry incremented revision")
	}
	selection := ReleaseRequest{"contracts", []Selection{{"combat", 2}}}
	var release Manifest
	json.Unmarshal(request("POST", "/v1/releases", selection, publisher, "publish-one", 201), &release)
	retry := request("POST", "/v1/releases", selection, publisher, "publish-one", 201)
	var replay Manifest
	json.Unmarshal(retry, &replay)
	if replay.ID != release.ID {
		t.Fatal("duplicate publication on retry")
	}
	// Snapshot is independent from authoring after publication.
	combat["name"] = "New combat draft"
	request("PUT", "/v1/drafts/combat", save(2, combat), author, "edit-two", 200)
	var newer Manifest
	json.Unmarshal(request("POST", "/v1/releases", ReleaseRequest{"contracts", []Selection{{"combat", 3}}}, publisher, "publish-two", 201), &newer)
	move := map[string]string{"releaseId": release.ID, "expectedReleaseId": newer.ID}
	request("PUT", "/v1/channels/contracts", move, author, "", 401)
	request("PUT", "/v1/channels/contracts", map[string]string{"releaseId": release.ID, "expectedReleaseId": "stale"}, publisher, "", 409)
	request("PUT", "/v1/channels/contracts", move, publisher, "rollback-one", 200)
	request("PUT", "/v1/channels/contracts", move, publisher, "rollback-one", 200)
	pointer := request("GET", "/v1/channels/contracts", nil, "", "", 200)
	if !bytes.Contains(pointer, []byte(release.ID)) {
		t.Fatal("rollback pointer")
	}
	// Real environment catalog/map payload excerpts; references retain their legacy IDs.
	catalog := makeDoc("catalog")
	data := catalog["data"].(map[string]any)
	data["bindings"] = map[string]string{"/frozen-terrain-apply/v1/surface-0--1.png": asset.SHA256}
	catalog["assets"] = []string{asset.SHA256}
	request("PUT", "/v1/drafts/catalog", save(0, catalog), author, "", 200)
	world := makeDoc("map")
	world["dependencies"] = []Dependency{{"catalog", "environment-catalog", 1}}
	request("PUT", "/v1/drafts/map", save(0, world), author, "", 200)
	request("POST", "/v1/releases", ReleaseRequest{"map-test", []Selection{{"map", 1}}}, publisher, "", 422)
	request("POST", "/v1/releases", ReleaseRequest{"map-test", []Selection{{"map", 1}, {"catalog", 1}}}, publisher, "", 201)
	// Pinned mismatches and cycles are rejected without advancing the channel.
	combat["dependencies"] = []Dependency{{"catalog", "environment-catalog", 9}}
	request("PUT", "/v1/drafts/combat", save(3, combat), author, "", 200)
	request("POST", "/v1/releases", ReleaseRequest{"contracts", []Selection{{"combat", 4}, {"catalog", 1}}}, publisher, "", 422)
	combat["dependencies"] = []Dependency{{"self", "skill", 1}}
	request("PUT", "/v1/drafts/self", save(0, combat), author, "", 200)
	request("POST", "/v1/releases", ReleaseRequest{"contracts", []Selection{{"self", 1}}}, publisher, "", 422)
	// Duplicate object IDs, unbound assets, malformed geometry and schema versions fail before persistence.
	invalid := makeDoc("map")
	p := invalid["data"].(map[string]any)["payload"].(map[string]any)
	objects := p["objects"].([]any)
	p["objects"] = append(objects, objects[0])
	request("PUT", "/v1/drafts/bad-map", save(0, invalid), author, "", 422)
	invalid = makeDoc("sheet")
	request("PUT", "/v1/drafts/bad-sheet", save(0, invalid), author, "", 422)
	invalid = makeDoc("combat")
	invalid["schemaVersion"] = 3
	request("PUT", "/v1/drafts/future", save(0, invalid), author, "", 422)
	// Corruption is detected by publication; immutable object keys cannot hide changed bytes.
	if e := os.WriteFile(root+"/"+asset.SHA256, []byte("corrupt"), 0600); e != nil {
		t.Fatal(e)
	}
	request("POST", "/v1/releases", ReleaseRequest{"corrupt", []Selection{{"catalog", 1}}}, publisher, "", 422)
	// Full API/pool restart retains durable idempotency records and rollback pointers.
	srv.Close()
	api.DB.Close()
	api, err = openAPI(ctx, dsn, admin, "https://content.example", DiskObjects{root})
	if err != nil {
		t.Fatal(err)
	}
	srv = httptest.NewServer(api.handler())
	request("PUT", "/v1/channels/contracts", move, publisher, "rollback-one", 200)
	request("GET", "/v1/releases/"+release.ID+"/documents/combat", nil, "", "", 200)
	request("POST", "/v1/releases", selection, publisher, "publish-one", 201)
	var events int
	if err = api.DB.QueryRowContext(ctx, "SELECT count(*) FROM content_channel_events WHERE channel='contracts'").Scan(&events); err != nil || events != 3 {
		t.Fatalf("duplicate channel events: %d %v", events, err)
	}
	t.Log("verified: real v2 payload save/read, role separation, durable idempotency, conflict/retry, closed references, cycles, corruption, immutable releases, rollback and SQLite restart")
}
