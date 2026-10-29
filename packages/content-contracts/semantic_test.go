package contracts

import (
	"encoding/json"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAuditedLegacyFixtures(t *testing.T) {
	compiler := jsonschema.NewCompiler()
	compiler.AddResource("document.json", strings.NewReader(DocumentSchema))
	schema, err := compiler.Compile("document.json")
	if err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob("../../fixtures/legacy/*.json")
	count := 0
	for _, path := range files {
		if filepath.Base(path) == "index.json" {
			continue
		}
		t.Run(filepath.Base(path), func(t *testing.T) {
			raw, e := os.ReadFile(path)
			if e != nil {
				t.Fatal(e)
			}
			var f map[string]any
			if e = json.Unmarshal(raw, &f); e != nil {
				t.Fatal(e)
			}
			bindings := map[string]any{}
			assets := []any{}
			for _, p := range RuntimePaths(text(f["format"]), mapping(f["payload"])) {
				bindings[p] = strings.Repeat("a", 64)
			}
			if len(bindings) > 0 {
				assets = append(assets, strings.Repeat("a", 64))
			}
			doc := map[string]any{"schemaVersion": float64(2), "kind": f["kind"], "name": f["id"], "assets": assets, "dependencies": []any{}, "provenance": f["provenance"], "data": map[string]any{"format": f["format"], "payload": f["payload"], "bindings": bindings}}
			if e = schema.Validate(doc); e != nil {
				t.Fatal(e)
			}
			if e = ValidateV2(doc); e != nil {
				t.Fatal(e)
			}
			count++
		})
	}
	if count != 15 {
		t.Fatalf("expected 15 audited fixtures, got %d", count)
	}
}
func TestReferenceGraph(t *testing.T) {
	dep := func(id string) map[string]any {
		return map[string]any{"id": id, "kind": "skill", "revision": float64(1)}
	}
	doc := func(ds ...any) map[string]any {
		return map[string]any{"schemaVersion": float64(2), "kind": "skill", "dependencies": ds, "data": map[string]any{"format": "arkadia.combat-rules.v1", "payload": map[string]any{}}}
	}
	docs := map[string]map[string]any{"a": doc(dep("b"))}
	revs := map[string]int64{"a": 1, "b": 1}
	if ValidateClosure(docs, revs) == nil {
		t.Fatal("missing reference accepted")
	}
	docs["b"] = doc(dep("a"))
	if ValidateClosure(docs, revs) == nil {
		t.Fatal("cycle accepted")
	}
	docs["b"] = doc()
	if e := ValidateClosure(docs, revs); e != nil {
		t.Fatal(e)
	}
	revs["b"] = 2
	if ValidateClosure(docs, revs) == nil {
		t.Fatal("unpinned dependency accepted")
	}
}

func TestValidationRejectsDomainErrors(t *testing.T) {
	load := func(name string) map[string]any {
		t.Helper()
		b, e := os.ReadFile("../../fixtures/legacy/" + name + ".json")
		if e != nil {
			t.Fatal(e)
		}
		var f map[string]any
		json.Unmarshal(b, &f)
		bindings := map[string]any{}
		for _, p := range RuntimePaths(text(f["format"]), mapping(f["payload"])) {
			bindings[p] = strings.Repeat("a", 64)
		}
		return map[string]any{"schemaVersion": float64(2), "assets": []any{strings.Repeat("a", 64)}, "dependencies": []any{}, "data": map[string]any{"format": f["format"], "payload": f["payload"], "bindings": bindings}}
	}
	cases := []struct {
		name, fixture string
		mutate        func(map[string]any)
	}{
		{"impact bounds", "character-hero", func(p map[string]any) { mapping(mapping(p["clips"])["attack"])["impact"] = float64(999) }},
		{"clip bounds", "character-hero", func(p map[string]any) { mapping(mapping(p["clips"])["idle"])["frames"] = []any{float64(99999)} }},
		{"atlas bounds", "character-hero", func(p map[string]any) { mapping(list(p["frames"])[0])["x"] = float64(99999) }},
		{"grid count", "sheet", func(p map[string]any) { p["frameCount"] = float64(99999) }},
		{"map chunks", "world", func(p map[string]any) { p["chunkTiles"] = float64(23) }},
		{"relief extent", "world", func(p map[string]any) { f := mapping(list(mapping(p["terrain"])["features"])[0]); f["u1"] = f["u0"] }},
		{"spawn budget", "map", func(p map[string]any) {
			for _, v := range list(p["objects"]) {
				o := mapping(v)
				if text(o["asset"]) == "spawn" {
					o["count"] = float64(201)
				}
			}
		}},
		{"unknown kit", "frontier", func(p map[string]any) { mapping(list(p["placements"])[0])["a"] = "missing" }},
		{"effect duplicate emitter", "effect", func(p map[string]any) { p["emitters"] = append(list(p["emitters"]), list(p["emitters"])[0]) }},
		{"GLTF accessor", "gltf-rift", func(p map[string]any) {
			mapping(list(mapping(list(p["animations"])[0])["samplers"])[0])["input"] = float64(999999)
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := load(c.fixture)
			c.mutate(mapping(mapping(doc["data"])["payload"]))
			if ValidateV2(doc) == nil {
				t.Fatal("invalid payload accepted")
			}
		})
	}
}
