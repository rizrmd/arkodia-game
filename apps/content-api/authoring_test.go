package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestAuthoringTransactions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authoring.db")
	token := strings.Repeat("a", 40)
	api, err := openAPI(context.Background(), path, token, "https://content.example", nil)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.handler())
	defer func() { server.Close(); api.DB.Close() }()
	request := func(method, url string, body any, key string, want int) []byte {
		t.Helper()
		data, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+url, bytes.NewReader(data))
		req.Header.Set("Authorization", "Bearer "+token)
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
			t.Fatalf("%s %s got %d want %d: %s", method, url, res.StatusCode, want, b)
		}
		return b
	}
	domains := map[string]map[string]contracts.AuthoringEntity{}
	for _, d := range contracts.AuthoringDomains {
		domains[d] = map[string]contracts.AuthoringEntity{}
	}
	doc := contracts.AuthoringDocument{SchemaVersion: 3, Kind: "authoring-project", Name: "Project", Assets: []string{}, Data: contracts.AuthoringData{OrganizationID: "org", ProjectID: "project", Domains: domains}}
	request("PUT", "/v1/drafts/project", map[string]any{"revision": 0, "document": doc}, "create", 200)
	request("PUT", "/v1/drafts/project", map[string]any{"revision": 1, "document": doc}, "bypass", 409)
	request("POST", "/v1/releases", ReleaseRequest{"stable", []Selection{{"project", 1}}}, "publish", 422)
	request("GET", "/contracts/v3/document.schema.json", nil, "", 200)
	entity := func(id string) *contracts.AuthoringEntity {
		return &contracts.AuthoringEntity{ID: id, Name: id, Data: map[string]any{"id": id, "parts": []any{}}, Assets: []string{}, References: []contracts.AuthoringReference{}}
	}
	ops := []contracts.AuthoringOperation{}
	for _, d := range contracts.AuthoringDomains {
		ops = append(ops, contracts.AuthoringOperation{Kind: "entity.put", Domain: d, ID: d, Label: "Add " + d, Entity: entity(d)})
	}
	change := func(rev int64, group, action, unit string, operations []contracts.AuthoringOperation) authoringRequest {
		return authoringRequest{Revision: rev, GroupID: group, Action: action, Unit: unit, Label: group, Actor: authoringActor{UserID: "user"}, Operations: operations}
	}
	route := "/v1/drafts/project/transactions"
	request("POST", route, change(1, "validation", "validate", "", ops), "validate", 200)
	var draft Draft
	json.Unmarshal(request("GET", "/v1/drafts/project", nil, "", 200), &draft)
	if draft.Revision != 1 {
		t.Fatal("validation wrote document")
	}
	first := request("POST", route, change(1, "all-domains", "commit", "", ops), "commit", 200)
	replay := request("POST", route, change(1, "all-domains", "commit", "", ops), "commit", 200)
	if !bytes.Equal(first, replay) {
		t.Fatal("idempotency changed response")
	}
	request("POST", route, change(1, "stale", "commit", "", ops), "stale", 409)
	request("POST", route, change(2, "no-key", "undo", "", nil), "", 428)
	var state struct {
		Revision int64                       `json:"revision"`
		Document contracts.AuthoringDocument `json:"document"`
	}
	json.Unmarshal(request("POST", route, change(2, "undo-step", "undo", "operation", nil), "undo-step", 200), &state)
	if len(state.Document.Data.Domains["catalog"]) != 0 || len(state.Document.Data.Domains["objects"]) != 1 {
		t.Fatal("step undo did not restore exact operation")
	}
	json.Unmarshal(request("POST", route, change(3, "undo-rest", "undo", "group", nil), "undo-rest", 200), &state)
	for _, d := range contracts.AuthoringDomains {
		if len(state.Document.Data.Domains[d]) != 0 {
			t.Fatal("group undo incomplete")
		}
	}
	request("POST", route, change(4, "redo-step", "redo", "operation", nil), "redo-step", 200)
	request("POST", route, change(5, "redo-rest", "redo", "group", nil), "redo-rest", 200)
	// An invalid last operation must roll back the entire cross-domain batch.
	invalid := entity("bad")
	invalid.References = []contracts.AuthoringReference{{Domain: "objects", ID: "missing"}}
	badOps := []contracts.AuthoringOperation{{Kind: "entity.put", Domain: "objects", ID: "good", Label: "Good", Entity: entity("good")}, {Kind: "entity.put", Domain: "audio", ID: "bad", Label: "Bad", Entity: invalid}}
	request("POST", route, change(6, "bad-graph", "commit", "", badOps), "bad-graph", 422)
	json.Unmarshal(request("GET", "/v1/drafts/project", nil, "", 200), &state)
	if state.Revision != 6 || len(state.Document.Data.Domains["objects"]) != 1 {
		t.Fatal("partial commit")
	}
	// References may target an entity created later in this same atomic batch.
	linked := entity("linked")
	linked.References = []contracts.AuthoringReference{{Domain: "objects", ID: "target"}}
	linkedOps := []contracts.AuthoringOperation{{Kind: "entity.put", Domain: "audio", ID: "linked", Label: "Link", Entity: linked}, {Kind: "entity.put", Domain: "objects", ID: "target", Label: "Target", Entity: entity("target")}}
	request("POST", route, change(6, "linked", "commit", "", linkedOps), "linked", 200)
	request("POST", route, change(7, "break-link", "undo", "operation", nil), "break-link", 422)
	request("POST", route, change(7, "undo-linked", "undo", "group", nil), "undo-linked", 200)
	request("POST", route, change(8, "new-after-undo", "commit", "", []contracts.AuthoringOperation{{Kind: "entity.put", Domain: "vfx", ID: "new", Label: "New", Entity: entity("new")}}), "new-after-undo", 200)
	request("POST", route, change(9, "invalid-redo", "redo", "group", nil), "invalid-redo", 409)
	// Competing users: one revision can commit only once.
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			input := change(9, []string{"writer-a", "writer-b"}[i], "undo", "operation", nil)
			b, _ := json.Marshal(input)
			req, _ := http.NewRequest("POST", server.URL+route, bytes.NewReader(b))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Idempotency-Key", input.GroupID)
			res, e := http.DefaultClient.Do(req)
			if e != nil {
				statuses <- 0
				return
			}
			res.Body.Close()
			statuses <- res.StatusCode
		}(i)
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for s := range statuses {
		counts[s]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent results %v", counts)
	}
	// Reopen the real database, replay a response and undo preserved history.
	server.Close()
	api.DB.Close()
	api, err = openAPI(context.Background(), path, token, "https://content.example", nil)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(api.handler())
	if !bytes.Equal(first, request("POST", route, change(1, "all-domains", "commit", "", ops), "commit", 200)) {
		t.Fatal("restart lost retry response")
	}
	request("GET", "/v1/drafts/project/history", nil, "", 200)
	request("POST", route, change(10, "restart-undo", "undo", "group", nil), "restart-undo", 200)
	var n int
	api.DB.QueryRow("SELECT count(*) FROM content_authoring_events WHERE document_id='project'").Scan(&n)
	if n != 10 {
		t.Fatalf("audit event count %d", n)
	}
}
func TestAuthoringHistoryLimit(t *testing.T) {
	// The history algorithm is exercised through the API, not an implementation mirror.
	ctx := context.Background()
	api, e := openAPI(ctx, filepath.Join(t.TempDir(), "limit.db"), strings.Repeat("x", 40), "https://example.com", nil)
	if e != nil {
		t.Fatal(e)
	}
	defer api.DB.Close()
	call := func(path string, body any, key string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", path, bytes.NewReader(b))
		r.Header.Set("Authorization", "Bearer "+api.Token)
		r.Header.Set("Idempotency-Key", key)
		w := httptest.NewRecorder()
		api.handler().ServeHTTP(w, r)
		return w
	}
	domains := map[string]any{}
	for _, d := range contracts.AuthoringDomains {
		domains[d] = map[string]any{}
	}
	doc := map[string]any{"schemaVersion": 3, "kind": "authoring-project", "name": "Limit", "assets": []string{}, "data": map[string]any{"organizationId": "org", "projectId": "limit", "domains": domains}}
	b, _ := json.Marshal(map[string]any{"revision": 0, "document": doc})
	r := httptest.NewRequest("PUT", "/v1/drafts/limit", bytes.NewReader(b))
	r.Header.Set("Authorization", "Bearer "+api.Token)
	w := httptest.NewRecorder()
	api.handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for i := 1; i <= 51; i++ {
		id := fmtSprint(i)
		entity := map[string]any{"id": "item", "name": "Item", "data": map[string]any{"value": i}, "assets": []string{}, "references": []any{}}
		w = call("/v1/drafts/limit/transactions", map[string]any{"revision": i, "groupId": "group-" + id, "label": "Edit", "actor": map[string]any{"userId": "user"}, "action": "commit", "operations": []any{map[string]any{"kind": "entity.put", "domain": "objects", "id": "item", "label": "Edit", "entity": entity}}}, "edit-"+id)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	var h struct {
		History struct {
			Groups []any `json:"groups"`
			Cursor int   `json:"cursor"`
		} `json:"history"`
	}
	json.Unmarshal(w.Body.Bytes(), &h)
	if len(h.History.Groups) != 50 || h.History.Cursor != 50 {
		t.Fatal("history bound")
	}
}
func fmtSprint(i int) string { b, _ := json.Marshal(i); return string(b) }
