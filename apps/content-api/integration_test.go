package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestContentLifecycle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated PostgreSQL database")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
	if _, err = conn.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer conn.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.RuntimeParams["search_path"] = schema
	// pgx URL accepts the search_path query option, which every pool connection inherits.
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	dsn += sep + "search_path=" + schema
	token := strings.Repeat("test-token", 5)
	root := t.TempDir()
	objects := DiskObjects{root}
	api, err := openAPI(ctx, dsn, token, "https://content.example", objects)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.handler())
	defer func() { srv.Close(); api.DB.Close() }()
	request := func(method, path string, body any, auth bool, want int) []byte {
		t.Helper()
		var reader io.Reader
		if raw, ok := body.([]byte); ok {
			reader = bytes.NewReader(raw)
		} else if body != nil {
			b, _ := json.Marshal(body)
			reader = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, srv.URL+path, reader)
		if auth {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		req.Header.Set("Content-Type", "application/json")
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
	request("GET", "/v1/drafts", nil, false, 401)
	request("PUT", "/v1/drafts/map", map[string]any{}, false, 401)
	assetBody := []byte("persistent-test-asset\x00\x01")
	var asset Asset
	json.Unmarshal(request("POST", "/v1/assets", assetBody, true, 201), &asset)
	if asset.SHA256 != hash(assetBody) {
		t.Fatal("asset hash")
	}
	request("GET", "/v1/assets/"+asset.SHA256, nil, false, 401)
	document := map[string]any{"schemaVersion": 1, "kind": "environment", "name": "Test world", "assets": []string{asset.SHA256}, "data": map[string]any{"width": 32, "height": 32, "layers": []any{}}}
	save := func(rev int64, doc any) map[string]any { return map[string]any{"revision": rev, "document": doc} }
	request("PUT", "/v1/drafts/map", save(0, document), true, 200)
	var loaded Draft
	json.Unmarshal(request("GET", "/v1/drafts/map", nil, true, 200), &loaded)
	if loaded.Revision != 1 {
		t.Fatal("revision")
	}
	request("PUT", "/v1/drafts/map", save(0, document), true, 409)
	invalid := map[string]any{"schemaVersion": 1, "kind": "environment", "name": "Bad", "assets": []string{}, "data": map[string]any{}}
	request("PUT", "/v1/drafts/bad", save(0, invalid), true, 422)
	missing := map[string]any{"schemaVersion": 1, "kind": "base", "name": "Missing", "assets": []string{strings.Repeat("a", 64)}, "data": document["data"]}
	request("PUT", "/v1/drafts/missing", save(0, missing), true, 422)
	// Two writers use the same base revision; exactly one can commit.
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, _ := json.Marshal(save(1, document))
			req, _ := http.NewRequest("PUT", srv.URL+"/v1/drafts/map", bytes.NewReader(b))
			req.Header.Set("Authorization", "Bearer "+token)
			res, e := http.DefaultClient.Do(req)
			if e != nil {
				statuses <- 0
				return
			}
			res.Body.Close()
			statuses <- res.StatusCode
		}()
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for s := range statuses {
		counts[s]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent saves: %v", counts)
	}
	request("POST", "/v1/releases", ReleaseRequest{"stable", []Selection{{"map", 1}}}, true, 409)
	var release Manifest
	json.Unmarshal(request("POST", "/v1/releases", ReleaseRequest{"stable", []Selection{{"map", 2}}}, true, 201), &release)
	if len(release.Documents) != 1 || len(release.Assets) != 1 {
		t.Fatal("manifest incomplete")
	}
	publicPath := "/v1/releases/" + release.ID
	before := request("GET", publicPath+"/documents/map", nil, false, 200)
	if hash(before) != release.Documents[0].SHA256 {
		t.Fatal("published document hash mismatch")
	}
	if !bytes.Equal(request("GET", publicPath+"/assets/"+asset.SHA256, nil, false, 200), assetBody) {
		t.Fatal("published asset differs")
	}
	request("GET", publicPath+"/documents/unpublished", nil, false, 404)
	request("GET", publicPath+"/assets/"+strings.Repeat("b", 64), nil, false, 404)
	request("GET", "/v1/channels/stable", nil, false, 200)
	document["name"] = "Edited draft"
	request("PUT", "/v1/drafts/map", save(2, document), true, 200)
	if !bytes.Equal(before, request("GET", publicPath+"/documents/map", nil, false, 200)) {
		t.Fatal("release mutated")
	}
	if _, e := api.DB.Exec(ctx, "UPDATE content_releases SET manifest='{}' WHERE id=$1", release.ID); e == nil {
		t.Fatal("database allowed immutable release update")
	}
	if _, e := api.DB.Exec(ctx, "DELETE FROM content_release_documents WHERE release_id=$1", release.ID); e == nil {
		t.Fatal("database allowed snapshot deletion")
	}
	// Restart the entire API and pool against the same PostgreSQL and disk objects.
	srv.Close()
	api.DB.Close()
	api, err = openAPI(ctx, dsn, token, "https://content.example", DiskObjects{root})
	if err != nil {
		t.Fatal(err)
	}
	srv = httptest.NewServer(api.handler())
	json.Unmarshal(request("GET", "/v1/drafts/map", nil, true, 200), &loaded)
	if loaded.Revision != 3 {
		t.Fatal("restart lost draft")
	}
	if !bytes.Equal(before, request("GET", publicPath+"/documents/map", nil, false, 200)) {
		t.Fatal("restart lost published snapshot")
	}
	request("GET", publicPath, nil, false, 200)
	request("GET", publicPath+"/assets/"+asset.SHA256, nil, false, 200)
	// Every content family shares the same persistence contract.
	for _, kind := range []string{"base", "character", "animation", "vfx"} {
		data := any(map[string]any{"width": 1, "height": 1, "layers": []any{}})
		if kind == "character" {
			data = map[string]any{"animations": map[string]string{}}
		}
		if kind == "animation" || kind == "vfx" {
			data = map[string]any{"fps": 12, "loop": true, "frames": []any{map[string]any{"asset": asset.SHA256, "x": 0, "y": 0, "width": 1, "height": 1}}}
		}
		d := map[string]any{"schemaVersion": 1, "kind": kind, "name": kind, "assets": []string{asset.SHA256}, "data": data}
		request("PUT", "/v1/drafts/"+kind, save(0, d), true, 200)
	}
	request("DELETE", "/v1/drafts/base", nil, true, 428)
	req, _ := http.NewRequest("DELETE", srv.URL+"/v1/drafts/base", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("If-Match", `"1"`)
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 204 {
		t.Fatal("delete failed")
	}
	request("GET", "/v1/drafts/base", nil, true, 404)
	t.Log("verified: all document kinds, authenticated CRUD, concurrent conflict, validation, immutable publish, game read, API restart persistence")
}
