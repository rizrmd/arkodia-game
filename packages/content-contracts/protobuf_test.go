package contracts

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	contentv1 "arkodia/game/packages/content-contracts/gen/go/arkadia/content/v1"
	contentv2 "arkodia/game/packages/content-contracts/gen/go/arkadia/content/v2"
	authoringv1 "arkodia/game/packages/content-contracts/gen/go/arkadia/authoring/v1"
	scenev1 "arkodia/game/packages/content-contracts/gen/go/arkadia/scene/v1"
	"google.golang.org/protobuf/proto"
)

// normalizeJSON drops default-valued fields so that proto3's "absent equals
// default" rule compares equal to JSON that omits the field.
func normalizeJSON(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, val := range x {
			if isDefaultJSON(val) {
				continue
			}
			out[k] = normalizeJSON(val)
		}
		return out
	case []any:
		out := []any{}
		for _, val := range x {
			out = append(out, normalizeJSON(val))
		}
		return out
	default:
		return v
	}
}

func isDefaultJSON(v any) bool {
	switch x := v.(type) {
	case nil:
		return true
	case bool:
		return !x
	case string:
		return x == ""
	case float64:
		return x == 0
	case []any:
		return len(x) == 0
	case map[string]any:
		return len(x) == 0
	}
	return false
}

func assertJSONProtoJSON(t *testing.T, name string, raw []byte, msg proto.Message) {
	t.Helper()
	if err := MarshalJSONToMessage(raw, msg); err != nil {
		t.Fatalf("%s: json -> proto: %v", name, err)
	}
	wire, err := MarshalMessageToBytes(msg)
	if err != nil {
		t.Fatalf("%s: proto -> bytes: %v", name, err)
	}
	again := proto.Clone(msg)
	if err := UnmarshalMessageFromBytes(wire, again); err != nil {
		t.Fatalf("%s: bytes -> proto: %v", name, err)
	}
	out, err := MarshalMessageToJSON(again)
	if err != nil {
		t.Fatalf("%s: proto -> json: %v", name, err)
	}
	var a, b any
	if err := json.Unmarshal(raw, &a); err != nil {
		t.Fatalf("%s: parse original: %v", name, err)
	}
	if err := json.Unmarshal(out, &b); err != nil {
		t.Fatalf("%s: parse round-trip: %v", name, err)
	}
	if !reflect.DeepEqual(normalizeJSON(a), normalizeJSON(b)) {
		t.Fatalf("%s: semantic mismatch\n original:  %s\n roundtrip: %s", name, raw, out)
	}
}

const manifestJSON = `{
  "schemaVersion": 1,
  "id": "release-1",
  "createdAt": "2026-11-09T00:00:00Z",
  "documents": [
    {"id": "scene", "revision": 1, "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "url": "https://example.invalid/scene", "kind": "environment", "schemaVersion": 1}
  ],
  "assets": [
    {"sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "size": 4, "mediaType": "image/png", "url": "https://example.invalid/a.png"}
  ]
}`

const environmentJSON = `{
  "schemaVersion": 1,
  "kind": "environment",
  "name": "Test scene",
  "assets": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  "data": {
    "runtimeProfile": "arkadia.pixi-scene.v1",
    "width": 1920,
    "height": 1280,
    "speed": 230,
    "spawn": {"x": 960, "y": 640},
    "layers": [
      {"id": "ground", "objects": [
        {"id": "hero", "x": 1, "y": 1, "animation": "walk", "scale": 1, "player": true}
      ]}
    ]
  }
}`

const animationJSON = `{
  "schemaVersion": 1,
  "kind": "animation",
  "name": "Walk",
  "assets": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  "data": {"fps": 6, "loop": true, "frames": [{"asset": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "x": 0, "y": 0, "width": 16, "height": 16}]}
}`

const legacyJSON = `{
  "schemaVersion": 2,
  "kind": "environment",
  "name": "Map",
  "assets": [],
  "dependencies": [{"id": "dep-1", "kind": "environment", "revision": 2}],
  "provenance": {"repository": "https://arkodia.online", "sourcePath": "/api/environment/published", "selector": "", "sourceSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "legacyId": "map"},
  "data": {
    "format": "arkadia.environment-map.v1",
    "payload": {"schema": 1, "revision": 3, "name": "Published", "objects": [{"id": "o1", "asset": "spawn", "u": 479, "v": 479, "count": 3, "radius": 6, "interval": 5}]},
    "bindings": {"/a.png": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
  }
}`

const authoringJSON = `{
  "schemaVersion": 3,
  "kind": "authoring-project",
  "name": "Project",
  "assets": [],
  "data": {
    "organizationId": "ORd5dd6f99b4308d6187031557",
    "projectId": "PJ8758f22f61165f3d3215e454",
    "domains": {
      "environments": {
        "env-1": {"id": "env-1", "name": "Env", "data": {"key": "value", "count": 3}, "assets": [], "references": [{"domain": "bases", "id": "base-1"}]}
      }
    }
  }
}`

func TestManifestRoundTrip(t *testing.T) {
	msg := &contentv1.Manifest{}
	assertJSONProtoJSON(t, "manifest", []byte(manifestJSON), msg)
}

func TestContentDocumentRoundTrip(t *testing.T) {
	assertJSONProtoJSON(t, "environment", []byte(environmentJSON), &contentv1.EnvironmentDocument{})
	assertJSONProtoJSON(t, "animation", []byte(animationJSON), &contentv1.AnimationDocument{})
}

func TestLegacyDocumentRoundTrip(t *testing.T) {
	assertJSONProtoJSON(t, "legacy", []byte(legacyJSON), &contentv2.LegacyDocument{})
}

func TestAuthoringProjectRoundTrip(t *testing.T) {
	assertJSONProtoJSON(t, "authoring", []byte(authoringJSON), &authoringv1.AuthoringProject{})
}

func TestSceneFixtureRoundTrip(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "apps", "runtime", "fixtures", "authored-scene.json"))
	if err != nil {
		t.Fatalf("read scene fixture: %v", err)
	}
	msg := &scenev1.Scene{}
	assertJSONProtoJSON(t, "scene", raw, msg)
}

func TestManifestMessageDispatch(t *testing.T) {
	msg, err := MarshalManifestJSONToMessage([]byte(manifestJSON))
	if err != nil {
		t.Fatalf("manifest json -> proto: %v", err)
	}
	wire, err := MarshalManifestMessageToBytes(msg)
	if err != nil {
		t.Fatalf("manifest proto -> bytes: %v", err)
	}
	back, err := UnmarshalManifestMessageFromBytes(wire)
	if err != nil {
		t.Fatalf("manifest bytes -> proto: %v", err)
	}
	if back.GetId() != "release-1" || len(back.GetDocuments()) != 1 || len(back.GetAssets()) != 1 {
		t.Fatalf("manifest round-trip lost data: %v", back)
	}
}

func TestMessageForJSONDispatch(t *testing.T) {
	cases := []struct {
		raw  string
		want proto.Message
	}{
		{environmentJSON, &contentv1.EnvironmentDocument{}},
		{animationJSON, &contentv1.AnimationDocument{}},
		{legacyJSON, &contentv2.LegacyDocument{}},
		{authoringJSON, &authoringv1.AuthoringProject{}},
	}
	for _, tc := range cases {
		msg, err := MessageForJSON([]byte(tc.raw))
		if err != nil {
			t.Fatalf("dispatch: %v", err)
		}
		if reflect.TypeOf(msg) != reflect.TypeOf(tc.want) {
			t.Fatalf("dispatch: got %T want %T", msg, tc.want)
		}
	}
	if _, err := MessageForJSON([]byte(`{"schemaVersion":9}`)); err == nil {
		t.Fatal("expected unsupported schemaVersion to fail")
	}
}
