package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	contracts "arkodia/game/packages/content-contracts"
	contentv1 "arkodia/game/packages/content-contracts/gen/go/arkadia/content/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	anypb "google.golang.org/protobuf/types/known/anypb"
)

// TestProtobufContentNegotiation proves the release manifest and a published
// document are served as protobuf when the client asks for that media type, and
// that the default JSON response is unchanged.
func TestProtobufContentNegotiation(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "protobuf.db")
	token := strings.Repeat("test-token", 5)
	api, err := openAPI(ctx, dsn, token, "https://content.example", nil)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.handler())
	defer func() { srv.Close(); api.DB.Close() }()

	do := func(method, path string, body any, auth, protobuf bool) (int, http.Header, []byte) {
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
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if protobuf {
			req.Header.Set("Accept", contracts.ProtobufMediaType)
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, res.Header, b
	}

	document := map[string]any{
		"schemaVersion": 1,
		"kind":          "environment",
		"name":          "Protobuf world",
		"assets":        []string{},
		"data": map[string]any{
			"runtimeProfile": "arkodia.pixi-scene.v1",
			"width":          640,
			"height":         480,
			"speed":          200,
			"spawn":          map[string]any{"x": 320, "y": 240},
			"layers":         []any{},
		},
	}
	status, _, body := do("PUT", "/v1/drafts/scene", map[string]any{"revision": 0, "document": document}, true, false)
	if status != 200 {
		t.Fatalf("save draft: %d %s", status, body)
	}
	status, _, body = do("POST", "/v1/releases", ReleaseRequest{"stable", []Selection{{"scene", 1}}}, true, false)
	if status != 201 {
		t.Fatalf("publish release: %d %s", status, body)
	}
	var release Manifest
	if err := json.Unmarshal(body, &release); err != nil {
		t.Fatal(err)
	}

	// Default JSON manifest is unchanged.
	status, headers, jsonBody := do("GET", "/v1/releases/"+release.ID, nil, false, false)
	if status != 200 || headers.Get("Content-Type") != "application/json" {
		t.Fatalf("json manifest: status %d content-type %q", status, headers.Get("Content-Type"))
	}

	// Protobuf manifest parses and equals the JSON manifest.
	status, headers, wire := do("GET", "/v1/releases/"+release.ID, nil, false, true)
	if status != 200 {
		t.Fatalf("protobuf manifest: %d %s", status, wire)
	}
	if got := headers.Get("Content-Type"); got != contracts.ProtobufMediaType {
		t.Fatalf("protobuf manifest content-type: %q", got)
	}
	protoMsg := &contentv1.Manifest{}
	if err := proto.Unmarshal(wire, protoMsg); err != nil {
		t.Fatalf("parse protobuf manifest: %v", err)
	}
	jsonMsg := &contentv1.Manifest{}
	if err := protojson.Unmarshal(jsonBody, jsonMsg); err != nil {
		t.Fatalf("parse json manifest: %v", err)
	}
	// The protobuf manifest adds protobuf_sha256; compare the shared fields.
	protoHashes := map[string]string{}
	for _, e := range protoMsg.Documents {
		protoHashes[e.Id] = e.ProtobufSha256
		e.ProtobufSha256 = ""
	}
	if !proto.Equal(protoMsg, jsonMsg) {
		t.Fatalf("manifest mismatch:\n protobuf: %v\n json:      %v", protoMsg, jsonMsg)
	}

	// Default JSON published document is unchanged.
	status, headers, jsonDoc := do("GET", "/v1/releases/"+release.ID+"/documents/scene", nil, false, false)
	if status != 200 || headers.Get("Content-Type") != "application/json" {
		t.Fatalf("json document: status %d content-type %q", status, headers.Get("Content-Type"))
	}

	// Protobuf published document parses and equals the JSON document.
	status, headers, wireDoc := do("GET", "/v1/releases/"+release.ID+"/documents/scene", nil, false, true)
	if status != 200 {
		t.Fatalf("protobuf document: %d %s", status, wireDoc)
	}
	if got := headers.Get("Content-Type"); got != contracts.ProtobufMediaType {
		t.Fatalf("protobuf document content-type: %q", got)
	}
	protoDoc := &contentv1.EnvironmentDocument{}
	if err := proto.Unmarshal(wireDoc, protoDoc); err != nil {
		t.Fatalf("parse protobuf document: %v", err)
	}
	jsonDocMsg := &contentv1.EnvironmentDocument{}
	if err := protojson.Unmarshal(jsonDoc, jsonDocMsg); err != nil {
		t.Fatalf("parse json document: %v", err)
	}
	if !proto.Equal(protoDoc, jsonDocMsg) {
		t.Fatalf("document mismatch:\n protobuf: %v\n json:      %v", protoDoc, jsonDocMsg)
	}
	if protoDoc.GetData().GetRuntimeProfile() != "arkodia.pixi-scene.v1" {
		t.Fatalf("scene profile lost: %v", protoDoc.GetData())
	}
	// The manifest's protobuf_sha256 must be the SHA-256 of the served bytes.
	if got := protoHashes["scene"]; got != hash(wireDoc) {
		t.Fatalf("protobuf_sha256 mismatch: manifest %q served %q", got, hash(wireDoc))
	}
}

// TestProtobufDraftWrite proves a protobuf write is stored as JSON that existing
// JSON readers see as equivalent to the JSON write.
func TestProtobufDraftWrite(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "protobuf-write.db")
	token := strings.Repeat("test-token", 5)
	api, err := openAPI(ctx, dsn, token, "https://content.example", nil)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.handler())
	defer func() { srv.Close(); api.DB.Close() }()

	do := func(method, path string, body []byte, contentType string, auth bool) (int, http.Header, []byte) {
		t.Helper()
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(body))
		if auth {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, res.Header, b
	}

	assetBody := []byte("protobuf-write-asset\x00\x01")
	_, _, assetRaw := do("POST", "/v1/assets", assetBody, "", true)
	var asset Asset
	if err := json.Unmarshal(assetRaw, &asset); err != nil {
		t.Fatal(err)
	}

	document := func() *contentv1.EnvironmentDocument {
		return &contentv1.EnvironmentDocument{
			SchemaVersion: 1,
			Kind:          "environment",
			Name:          "Protobuf write",
			Assets:        []string{asset.SHA256},
			Data: &contentv1.SceneData{
				RuntimeProfile: "arkodia.pixi-scene.v1",
				Width:          640,
				Height:         480,
				Speed:          200,
				Spawn:          &contentv1.Vector2{X: 320, Y: 240},
				Layers: []*contentv1.Layer{{
					Id: "ground",
					Objects: []*contentv1.EntitySpec{{
						Id: "hero", X: 1, Y: 1, Animation: "walk", Scale: 1,
					}},
				}},
			},
		}
	}

	docAny, err := anypb.New(document())
	if err != nil {
		t.Fatal(err)
	}
	wire, err := proto.Marshal(&contentv1.DraftSaveRequest{Revision: 0, Document: docAny})
	if err != nil {
		t.Fatal(err)
	}
	status, _, body := do("PUT", "/v1/drafts/scene", wire, contracts.ProtobufMediaType, true)
	if status != 200 {
		t.Fatalf("protobuf write: %d %s", status, body)
	}

	// The stored draft reads back as equivalent JSON.
	status, _, stored := do("GET", "/v1/drafts/scene", nil, "", true)
	if status != 200 {
		t.Fatalf("read draft: %d %s", status, stored)
	}
	var draft Draft
	if err := json.Unmarshal(stored, &draft); err != nil {
		t.Fatal(err)
	}
	var storedDoc contentv1.EnvironmentDocument
	if err := protojson.Unmarshal(draft.Document, &storedDoc); err != nil {
		t.Fatalf("stored draft is not the protobuf document: %v", err)
	}
	if !proto.Equal(&storedDoc, document()) {
		t.Fatalf("stored draft differs:\n stored: %v\n wanted: %v", &storedDoc, document())
	}

	// A JSON write of the same document produces the same stored content.
	jsonBody, err := json.Marshal(map[string]any{"revision": 0, "document": draft.Document})
	if err != nil {
		t.Fatal(err)
	}
	status, _, body = do("PUT", "/v1/drafts/json", jsonBody, "application/json", true)
	if status != 200 {
		t.Fatalf("json write: %d %s", status, body)
	}
	var jsonDraft Draft
	if err := json.Unmarshal(body, &jsonDraft); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(draft.Document, jsonDraft.Document) {
		t.Fatalf("json write stored different bytes:\n protobuf: %s\n json:     %s", draft.Document, jsonDraft.Document)
	}
}
