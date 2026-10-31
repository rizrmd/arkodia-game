package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type multiplayerFixture struct {
	t      *testing.T
	api    *API
	server *httptest.Server
	token  string
	next   int
}

func newMultiplayer(t *testing.T) *multiplayerFixture {
	t.Helper()
	a, e := openAPI(context.Background(), filepath.Join(t.TempDir(), "content.db"), strings.Repeat("m", 40), "https://content.example", nil)
	if e != nil {
		t.Fatal(e)
	}
	f := &multiplayerFixture{t: t, api: a, server: httptest.NewServer(a.handler()), token: strings.Repeat("m", 40)}
	t.Cleanup(func() { f.server.Close(); a.DB.Close() })
	domains := map[string]map[string]contracts.AuthoringEntity{}
	for _, d := range contracts.AuthoringDomains {
		domains[d] = map[string]contracts.AuthoringEntity{}
	}
	doc := contracts.AuthoringDocument{SchemaVersion: 3, Kind: "authoring-project", Name: "Arkodia", Assets: []string{}, Data: contracts.AuthoringData{OrganizationID: "org", ProjectID: "project", Domains: domains}}
	f.request("PUT", "/v1/drafts/project", map[string]any{"revision": 0, "document": doc}, "create", 200)
	for _, id := range []string{"a", "b", "c"} {
		op := multiOp(id, 0, 0)
		doc.Data.Domains["environments"][op.ID] = *op.Entity
	}
	f.command("admin", "admin-tab", map[string]any{"action": "initialize", "document": doc}, 200)
	return f
}
func multiID(id string) string { return fmt.Sprintf("override-%x", sha256.Sum256([]byte(id))) }
func multiOp(id string, x, y float64) contracts.AuthoringOperation {
	key := multiID(id)
	return contracts.AuthoringOperation{Kind: "entity.put", Domain: "environments", ID: key, Label: "Move " + id, Entity: &contracts.AuthoringEntity{ID: key, Name: id, Data: map[string]any{"format": "arkodia.environment.override.v1", "legacyId": id, "native": map[string]any{"id": id, "x": x, "y": y}}, Assets: []string{}, References: []contracts.AuthoringReference{}}}
}
func (f *multiplayerFixture) request(method, path string, input any, key string, want int) map[string]any {
	f.t.Helper()
	data, _ := json.Marshal(input)
	req, _ := http.NewRequest(method, f.server.URL+path, bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+f.token)
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		f.t.Fatal(e)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		f.t.Fatalf("%s got %d want %d: %s", path, res.StatusCode, want, b)
	}
	var result map[string]any
	json.Unmarshal(b, &result)
	return result
}
func (f *multiplayerFixture) command(user, session string, input map[string]any, want int) map[string]any {
	f.t.Helper()
	f.next++
	input["actor"] = map[string]string{"userId": user}
	input["session"] = session
	return f.request("POST", "/v1/drafts/project/collaboration", input, fmt.Sprintf("key-%d", f.next), want)
}
func (f *multiplayerFixture) read(user, session string) map[string]any {
	return f.request("GET", "/v1/drafts/project/collaboration?user="+user+"&session="+session, nil, "", 200)
}
func resourceFor(id string) string { return "environments/" + multiID(id) }
func (f *multiplayerFixture) acquire(user, session string, ids ...string) map[string]any {
	resources := []string{}
	for _, id := range ids {
		resources = append(resources, resourceFor(id))
	}
	return f.command(user, session, map[string]any{"action": "acquire", "resources": resources}, 200)
}
func tokens(s map[string]any, ids ...string) map[string]any {
	r := map[string]any{}
	for _, id := range ids {
		k := resourceFor(id)
		r[k] = s["leases"].(map[string]any)[k].(map[string]any)["token"]
	}
	return r
}
func (f *multiplayerFixture) commit(user, session, group string, op contracts.AuthoringOperation, lock map[string]any, want int) map[string]any {
	k := collabResource(op)
	return f.command(user, session, map[string]any{"action": "commit", "groupId": group, "label": group, "scope": "Environment", "operations": []contracts.AuthoringOperation{op}, "tokens": tokens(lock, op.Entity.Data["legacyId"].(string)), "expectedEntityVersions": map[string]any{k: lock["versions"].(map[string]any)[k]}}, want)
}
func (f *multiplayerFixture) release(user, session string, lock map[string]any, ids ...string) {
	resources := []string{}
	for _, id := range ids {
		resources = append(resources, resourceFor(id))
	}
	f.command(user, session, map[string]any{"action": "release", "resources": resources, "tokens": tokens(lock, ids...)}, 200)
}
func multiPosition(s map[string]any, id, axis string) float64 {
	return s["document"].(map[string]any)["data"].(map[string]any)["domains"].(map[string]any)["environments"].(map[string]any)[multiID(id)].(map[string]any)["data"].(map[string]any)["native"].(map[string]any)[axis].(float64)
}

func TestMultiplayerIndependentWritesAndLocks(t *testing.T) {
	f := newMultiplayer(t)
	a := f.acquire("alice", "a-tab", "a")
	b := f.acquire("bob", "b-tab", "b")
	f.command("bob", "b-tab", map[string]any{"action": "acquire", "resources": []string{resourceFor("c"), resourceFor("a")}}, 423)
	if _, ok := f.read("bob", "b-tab")["leases"].(map[string]any)[resourceFor("c")]; ok {
		t.Fatal("partial lease acquisition")
	}
	if f.read("bob", "b-tab")["leases"].(map[string]any)[resourceFor("a")].(map[string]any)["token"] != float64(0) {
		t.Fatal("leaked another session fencing token")
	}
	f.command("alice", "second-tab", map[string]any{"action": "acquire", "resources": []string{resourceFor("a")}}, 423)
	f.commit("alice", "a-tab", "alice-a", multiOp("a", 10, 0), a, 200)
	// Bob's entity version remains valid even though the global project revision moved.
	result := f.commit("bob", "b-tab", "bob-b", multiOp("b", 20, 0), b, 200)
	if multiPosition(result, "a", "x") != 10 || multiPosition(result, "b", "x") != 20 {
		t.Fatal("lost independent write")
	}
	f.commit("alice", "a-tab", "stale", multiOp("a", 99, 0), a, 409)
	f.request("POST", "/v1/drafts/project/transactions", authoringRequest{Revision: int64(result["revision"].(float64)), GroupID: "bypass", Label: "bypass", Action: "undo", Actor: authoringActor{UserID: "alice"}}, "bypass", 409)
	f.release("alice", "a-tab", a, "a")
	again := f.acquire("alice", "a-tab", "a")
	if reflectTokens := tokens(again, "a")[resourceFor("a")]; reflectTokens == tokens(a, "a")[resourceFor("a")] {
		t.Fatal("fence reused")
	}
	f.commit("alice", "a-tab", "old-fence", multiOp("a", 99, 0), a, 423)
}
func TestMultiplayerSelectiveUndoAndRedo(t *testing.T) {
	f := newMultiplayer(t)
	a := f.acquire("alice", "alice", "a")
	f.commit("alice", "alice", "old-a", multiOp("a", 10, 0), a, 200)
	f.release("alice", "alice", a, "a")
	b := f.acquire("alice", "alice", "b")
	f.commit("alice", "alice", "own-b", multiOp("b", 30, 0), b, 200)
	f.release("alice", "alice", b, "b")
	a = f.acquire("bob", "bob", "a")
	f.commit("bob", "bob", "bob-a", multiOp("a", 20, 0), a, 200)
	f.release("bob", "bob", a, "a")
	r := f.command("alice", "alice", map[string]any{"action": "undo", "scope": "Environment"}, 200)
	if multiPosition(r, "a", "x") != 20 || multiPosition(r, "b", "x") != 0 {
		t.Fatal("undo touched another user's work")
	}
	r = f.command("alice", "alice", map[string]any{"action": "undo", "scope": "Environment"}, 200)
	if len(r["skipped"].([]any)) != 1 || multiPosition(r, "a", "x") != 20 {
		t.Fatal("did not skip overwritten own history")
	}
	r = f.command("alice", "alice", map[string]any{"action": "redo", "scope": "Environment"}, 200)
	if multiPosition(r, "b", "x") != 30 {
		t.Fatal("personal redo failed")
	}
	// Different fields on the same entity: undo x while preserving Bob's y.
	c := f.acquire("alice", "alice", "c")
	f.commit("alice", "alice", "alice-c", multiOp("c", 5, 0), c, 200)
	f.release("alice", "alice", c, "c")
	c = f.acquire("bob", "bob", "c")
	f.commit("bob", "bob", "bob-c", multiOp("c", 5, 7), c, 200)
	f.release("bob", "bob", c, "c")
	r = f.command("alice", "alice", map[string]any{"action": "undo", "scope": "Environment"}, 200)
	if multiPosition(r, "c", "x") != 0 || multiPosition(r, "c", "y") != 7 {
		t.Fatal("property undo lost a remote field")
	}
	r = f.command("alice", "alice", map[string]any{"action": "undo", "scope": "object:other"}, 200)
	if multiPosition(r, "b", "x") != 30 {
		t.Fatal("scope escaped")
	}
}
func TestMultiplayerRetryExpiryReplayAndValidation(t *testing.T) {
	f := newMultiplayer(t)
	a := f.acquire("alice", "alice", "a")
	op := multiOp("a", 1, 0)
	input := map[string]any{"action": "commit", "actor": map[string]string{"userId": "alice"}, "session": "alice", "groupId": "once", "scope": "Environment", "label": "once", "operations": []contracts.AuthoringOperation{op}, "tokens": tokens(a, "a"), "expectedEntityVersions": map[string]int{resourceFor("a"): 1}}
	first := f.request("POST", "/v1/drafts/project/collaboration", input, "once", 200)
	f.release("alice", "alice", a, "a")
	a = f.acquire("alice", "alice", "a")
	f.commit("alice", "alice", "later", multiOp("a", 2, 0), a, 200)
	replay := f.request("POST", "/v1/drafts/project/collaboration", input, "once", 200)
	if replay["revision"] != first["revision"] || multiPosition(f.read("alice", "alice"), "a", "x") != 2 {
		t.Fatal("retry reapplied or response changed")
	}
	input["label"] = "different"
	f.request("POST", "/v1/drafts/project/collaboration", input, "once", 409)
	// Expired leases cannot renew or commit and are available to another actor.
	ctx := context.Background()
	state, _, _ := collabLoad(ctx, f.api.query(ctx), "project")
	l := state.Leases[resourceFor("a")]
	l.Expires = 0
	state.Leases[resourceFor("a")] = l
	body, _ := json.Marshal(state)
	f.api.DB.Exec("UPDATE content_collaboration SET body=? WHERE document_id='project'", body)
	f.command("alice", "alice", map[string]any{"action": "renew", "resources": []string{resourceFor("a")}, "tokens": tokens(a, "a")}, 409)
	f.acquire("bob", "bob", "a")
	f.commit("alice", "alice", "expired", multiOp("a", 99, 0), a, 423)
	result := f.request("GET", "/v1/drafts/project/collaboration?after=1&user=bob&session=bob", nil, "", 200)
	if len(result["events"].([]any)) == 0 {
		t.Fatal("missing durable replay")
	}
	f.command("admin", "admin-tab", map[string]any{"action": "initialize"}, 409)
}
func TestMultiplayerConcurrentLeaseWinner(t *testing.T) {
	f := newMultiplayer(t)
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for _, u := range []string{"alice", "bob"} {
		wg.Add(1)
		go func(user string) {
			defer wg.Done()
			data, _ := json.Marshal(map[string]any{"action": "acquire", "actor": map[string]string{"userId": user}, "session": user, "resources": []string{resourceFor("a")}})
			req, _ := http.NewRequest("POST", f.server.URL+"/v1/drafts/project/collaboration", bytes.NewReader(data))
			req.Header.Set("Authorization", "Bearer "+f.token)
			req.Header.Set("Idempotency-Key", "race-"+user)
			r, e := http.DefaultClient.Do(req)
			if e != nil {
				statuses <- 0
				return
			}
			io.Copy(io.Discard, r.Body)
			r.Body.Close()
			statuses <- r.StatusCode
		}(u)
	}
	wg.Wait()
	close(statuses)
	wins := 0
	for status := range statuses {
		if status == 200 {
			wins++
		} else if status != 423 && status != 409 {
			t.Fatalf("unexpected status %d", status)
		}
	}
	if wins != 1 {
		t.Fatalf("%d lock winners", wins)
	}
}

func TestMultiplayerPreviewAndValidationAreNotAuthoredHistory(t *testing.T) {
	f := newMultiplayer(t)
	lock := f.acquire("alice", "alice", "a")
	revision := f.read("alice", "alice")["revision"]
	// Heartbeats retain compact idempotent responses, not copies of the entire scene.
	if _, exists := lock["document"]; exists {
		t.Fatal("lease response contains the entire document")
	}
	f.command("alice", "alice", map[string]any{"action": "presence", "cursor": map[string]int{"x": 4, "y": 5}, "selection": "a"}, 200)
	f.command("alice", "alice", map[string]any{"action": "preview", "tokens": tokens(lock, "a"), "preview": map[string]any{resourceFor("a"): map[string]any{"id": "a", "x": 12, "y": 14}}}, 200)
	state := f.read("bob", "bob")
	if state["revision"] != revision || len(state["groups"].([]any)) != 0 {
		t.Fatal("preview entered authored history")
	}
	if len(state["presence"].([]any)[0].(map[string]any)["preview"].(map[string]any)) != 1 {
		t.Fatal("missing leased live preview")
	}
	f.command("bob", "bob", map[string]any{"action": "preview", "tokens": tokens(lock, "a"), "preview": map[string]any{resourceFor("a"): map[string]any{"id": "a", "x": 99, "y": 99}}}, 423)
	f.request("POST", "/v1/drafts/project/transactions", authoringRequest{Revision: int64(revision.(float64)), GroupID: "dry-run", Label: "Dry run", Action: "validate", Actor: authoringActor{UserID: "alice"}, Operations: []contracts.AuthoringOperation{multiOp("a", 12, 14)}}, "dry-run", 200)
	state = f.read("alice", "alice")
	if state["revision"] != revision || multiPosition(state, "a", "x") != 0 {
		t.Fatal("validation wrote content")
	}
	f.commit("alice", "alice", "finished-drag", multiOp("a", 12, 14), lock, 200)
	state = f.read("bob", "bob")
	person := state["presence"].([]any)[0].(map[string]any)
	if preview, ok := person["preview"].(map[string]any); ok && len(preview) > 0 {
		t.Fatal("committed content still masked by transient preview")
	}
}
