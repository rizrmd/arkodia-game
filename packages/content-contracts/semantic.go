package contracts

import (
	"fmt"
	"math"
	"strings"
)

func mapping(v any) map[string]any { m, _ := v.(map[string]any); return m }
func list(v any) []any             { a, _ := v.([]any); return a }
func number(v any) float64         { n, _ := v.(float64); return n }
func text(v any) string            { s, _ := v.(string); return s }
func UniqueIDs(items []any, key string) error {
	seen := map[string]bool{}
	for _, v := range items {
		id := text(mapping(v)[key])
		if id == "" || seen[id] {
			return fmt.Errorf("duplicate_or_empty_%s", key)
		}
		seen[id] = true
	}
	return nil
}

// RuntimePaths enumerates runtime binary references, not editor source-attribution paths.
func RuntimePaths(format string, p map[string]any) []string {
	paths := []string{}
	add := func(v any) {
		if s := text(v); s != "" {
			paths = append(paths, s)
		}
	}
	switch format {
	case "arkadia.environment-catalog.v1":
		for _, v := range list(p["assets"]) {
			a := mapping(v)
			add(a["file"])
			for _, c := range list(a["components"]) {
				add(mapping(c)["file"])
			}
		}
	case "arkadia.character-atlas.v1", "arkadia.equipment-atlas.v1":
		add(p["image"])
	case "arkadia.hero-glb.v1":
		add(p["glb"])
		add(p["thumbnail"])
	case "arkadia.sprite-sheet.v1":
		add(p["source"])
	case "arkadia.gltf.v2":
		add("$glb")
	case "arkadia.asset-manifest.v1":
		for _, v := range list(p["entries"]) {
			add(mapping(v)["path"])
		}
	case "arkadia.nixie-effect.v1":
		var walk func(any)
		walk = func(v any) {
			switch v := v.(type) {
			case map[string]any:
				for k, x := range v {
					if k == "texture" || k == "path" {
						s := text(x)
						if strings.HasPrefix(s, "textures/") {
							add(s)
						}
					}
					walk(x)
				}
			case []any:
				for _, x := range v {
					walk(x)
				}
			}
		}
		walk(p)
	case "arkadia.visual-patches.v1":
		for _, layers := range mapping(p["effects"]) {
			for _, v := range mapping(layers) {
				add(mapping(v)["texture"])
			}
		}
	}
	return paths
}
func ValidateV2(v map[string]any) error {
	if number(v["schemaVersion"]) != 2 {
		return nil
	}
	data := mapping(v["data"])
	p := mapping(data["payload"])
	format := text(data["format"])
	bindings := mapping(data["bindings"])
	assets := map[string]bool{}
	for _, a := range list(v["assets"]) {
		assets[text(a)] = true
	}
	for _, a := range bindings {
		if !assets[text(a)] {
			return fmt.Errorf("binding_asset_not_declared")
		}
	}
	for _, path := range RuntimePaths(format, p) {
		if text(bindings[path]) == "" {
			return fmt.Errorf("unbound_runtime_asset:%s", path)
		}
	}
	if err := UniqueIDs(list(v["dependencies"]), "id"); err != nil {
		return err
	}
	switch format {
	case "arkadia.environment-map.v1":
		if err := UniqueIDs(list(p["objects"]), "id"); err != nil {
			return err
		}
		count := 0.0
		for _, v := range list(p["objects"]) {
			o := mapping(v)
			if text(o["asset"]) == "spawn" {
				n := number(o["count"])
				if n < 1 || number(o["radius"]) < .5 || number(o["interval"]) < .5 {
					return fmt.Errorf("invalid_spawn")
				}
				count += n
			}
		}
		if count > 200 {
			return fmt.Errorf("spawn_budget_exceeded")
		}
	case "arkadia.environment-catalog.v1":
		if err := UniqueIDs(list(p["assets"]), "id"); err != nil {
			return err
		}
		for _, v := range list(p["assets"]) {
			a := mapping(v)
			for _, r := range list(a["blocks"]) {
				b := list(r)
				if number(b[2]) < number(b[0]) || number(b[3]) < number(b[1]) {
					return fmt.Errorf("invalid_collision_rectangle")
				}
			}
			for _, c := range list(a["columns"]) {
				m := mapping(c)
				if number(m["front"]) < number(m["back"]) {
					return fmt.Errorf("invalid_collision_column")
				}
			}
		}
	case "arkadia.world-map.v1":
		if math.Mod(number(p["sizeTiles"]), number(p["chunkTiles"])) != 0 {
			return fmt.Errorf("nonintegral_map_chunks")
		}
	case "arkadia.stronghold-prefab.v1":
		g := mapping(p["gate"])
		if number(g["passableAt"]) < 0 || number(g["passableAt"]) > 1 {
			return fmt.Errorf("invalid_gate_threshold")
		}
		if number(mapping(p["court"])["walkInset"])*2 >= number(mapping(p["court"])["size"]) {
			return fmt.Errorf("invalid_court_walk_inset")
		}
	case "arkadia.hero-glb.v1":
		if err := UniqueIDs(list(p["animations"]), "slug"); err != nil {
			return err
		}
	case "arkadia.gltf.v2":
		for _, v := range list(p["animations"]) {
			anim := mapping(v)
			samplers := list(anim["samplers"])
			for _, v := range samplers {
				sampler := mapping(v)
				for _, key := range []string{"input", "output"} {
					n, ok := sampler[key].(float64)
					if !ok || n < 0 || n != math.Trunc(n) || n >= float64(len(list(p["accessors"]))) {
						return fmt.Errorf("gltf_accessor_out_of_range")
					}
				}
			}
			for _, v := range list(anim["channels"]) {
				ch := mapping(v)
				n := number(ch["sampler"])
				if n < 0 || n != math.Trunc(n) || n >= float64(len(samplers)) {
					return fmt.Errorf("gltf_sampler_out_of_range")
				}
				if node, ok := mapping(ch["target"])["node"]; ok && (number(node) < 0 || number(node) >= float64(len(list(p["nodes"])))) {
					return fmt.Errorf("gltf_target_out_of_range")
				}
			}
		}
	case "arkadia.frontier.v1":
		for _, v := range list(p["placements"]) {
			if mapping(p["kit"])[text(mapping(v)["a"])] == nil {
				return fmt.Errorf("unknown_frontier_kit")
			}
		}
	case "arkadia.character-atlas.v1":
		frames := list(p["frames"])
		size := list(p["atlasSize"])
		for _, v := range frames {
			f := mapping(v)
			if number(f["x"]) < 0 || number(f["y"]) < 0 || number(f["x"])+number(f["w"]) > number(size[0]) || number(f["y"])+number(f["h"]) > number(size[1]) {
				return fmt.Errorf("frame_outside_atlas")
			}
		}
		for _, v := range mapping(p["clips"]) {
			c := mapping(v)
			for _, n := range list(c["frames"]) {
				if number(n) >= float64(len(frames)) {
					return fmt.Errorf("clip_frame_out_of_range")
				}
			}
			if n, ok := c["impact"]; ok && number(n) >= float64(len(list(c["frames"]))) {
				return fmt.Errorf("impact_out_of_range")
			}
		}
	case "arkadia.equipment-atlas.v1":
		if err := UniqueIDs(list(p["items"]), "id"); err != nil {
			return err
		}
		size := list(p["atlasSize"])
		if number(p["icon"]) <= 0 || number(p["icon"]) > math.Max(number(size[0]), number(size[1])) {
			return fmt.Errorf("equipment_icon_size_invalid")
		}
		for _, v := range list(p["items"]) {
			f := mapping(v)
			if number(f["x"]) < 0 || number(f["y"]) < 0 || number(f["x"])+number(f["w"]) > number(size[0]) || number(f["y"])+number(f["h"]) > number(size[1]) {
				return fmt.Errorf("equipment_rect_outside_atlas")
			}
		}
	case "arkadia.sprite-sheet.v1":
		if n, ok := p["frameCount"]; ok && number(n) > number(p["columns"])*number(p["rows"]) {
			return fmt.Errorf("frame_count_exceeds_grid")
		}
	case "arkadia.nixie-effect.v1":
		if err := UniqueIDs(list(p["emitters"]), "id"); err != nil {
			return err
		}
		loop := mapping(mapping(p["timeline"])["loop"])
		if number(loop["start"]) > number(loop["end"]) || number(loop["end"]) > number(mapping(p["timeline"])["duration"]) {
			return fmt.Errorf("invalid_effect_loop")
		}
	case "arkadia.visual-patches.v1":
		for _, ls := range mapping(p["effects"]) {
			for id, v := range mapping(ls) {
				s := text(mapping(v)["source"])
				if s == id || s != "" && text(mapping(mapping(ls)[s])["source"]) != "" {
					return fmt.Errorf("visual_layer_self_reference")
				}
			}
		}
	}
	features := []any{}
	if format == "arkadia.world-map.v1" {
		features = list(mapping(p["terrain"])["features"])
	}
	if format == "arkadia.frontier.v1" {
		features = list(p["terrain"])
	}
	if err := UniqueIDs(features, "id"); err != nil {
		return err
	}
	featureIDs := map[string]bool{}
	for _, v := range features {
		f := mapping(v)
		featureIDs[text(f["id"])] = true
		if number(f["u1"]) <= number(f["u0"]) || number(f["v1"]) <= number(f["v0"]) {
			return fmt.Errorf("invalid_relief_bounds")
		}
		if text(f["type"]) == "plateau" {
			if number(f["heightM"]) <= 0 {
				return fmt.Errorf("invalid_plateau_height")
			}
		} else if text(f["ascend"]) == "" || f["topM"] == nil || f["baseM"] == nil {
			return fmt.Errorf("invalid_ramp_heights")
		}
	}
	for _, v := range features {
		f := mapping(v)
		if id := text(f["connectsTo"]); id != "" && !featureIDs[id] {
			return fmt.Errorf("relief_connection_missing")
		}
	}
	return nil
}

// ValidateClosure requires pinned dependencies, checks kinds, rejects cycles, and validates legacy references.
func ValidateClosure(docs map[string]map[string]any, revisions map[string]int64) error {
	state := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if state[id] == 1 {
			return fmt.Errorf("cyclic_document_dependency")
		}
		if state[id] == 2 {
			return nil
		}
		state[id] = 1
		doc := docs[id]
		for _, v := range list(doc["dependencies"]) {
			d := mapping(v)
			key := text(d["id"])
			target, ok := docs[key]
			if !ok {
				return fmt.Errorf("missing_dependency:%s", key)
			}
			if text(target["kind"]) != text(d["kind"]) || revisions[key] != int64(number(d["revision"])) {
				return fmt.Errorf("dependency_revision_or_kind_mismatch:%s", key)
			}
			if err := visit(key); err != nil {
				return err
			}
		}
		state[id] = 2
		return nil
	}
	for id, doc := range docs {
		if err := visit(id); err != nil {
			return err
		}
		if number(doc["schemaVersion"]) != 2 {
			continue
		}
		data := mapping(doc["data"])
		p := mapping(data["payload"])
		deps := map[string]map[string]any{}
		for _, v := range list(doc["dependencies"]) {
			dep := docs[text(mapping(v)["id"])]
			dd := mapping(dep["data"])
			deps[text(dd["format"])] = mapping(dd["payload"])
		}
		switch text(data["format"]) {
		case "arkadia.environment-map.v1":
			catalog, ok := deps["arkadia.environment-catalog.v1"]
			if !ok {
				return fmt.Errorf("environment_catalog_dependency_required")
			}
			known := map[string]bool{}
			for _, v := range list(catalog["assets"]) {
				known[text(mapping(v)["id"])] = true
			}
			for _, v := range list(p["objects"]) {
				if !known[text(mapping(v)["asset"])] {
					return fmt.Errorf("unknown_environment_asset")
				}
			}
		case "arkadia.frontier.v1":
			world, ok := deps["arkadia.world-map.v1"]
			if !ok || text(world["id"]) != text(p["map"]) {
				return fmt.Errorf("frontier_world_dependency_required")
			}
		case "arkadia.world-map.v1":
			prefab, ok := deps["arkadia.stronghold-prefab.v1"]
			if !ok {
				return fmt.Errorf("prefab_dependency_required")
			}
			if number(p["metersPerTile"]) != number(mapping(prefab["safeZone"])["metersPerTile"]) {
				return fmt.Errorf("map_prefab_units_mismatch")
			}
			for _, v := range list(p["prefabs"]) {
				if text(mapping(v)["prefab"]) != text(prefab["id"]) {
					return fmt.Errorf("unknown_prefab")
				}
			}
		case "arkadia.fx-profile.v1":
			known := map[string]bool{}
			parents := map[string]bool{}
			for _, v := range list(doc["dependencies"]) {
				dep := docs[text(mapping(v)["id"])]
				d := mapping(dep["data"])
				pl := mapping(d["payload"])
				if text(d["format"]) == "arkadia.nixie-effect.v1" {
					key := text(mapping(dep["provenance"])["legacyId"])
					known[key] = true
				}
				if text(d["format"]) == "arkadia.fx-profile.v1" {
					parents[text(pl["id"])] = true
				}
			}
			if parent := text(p["extends"]); parent != "" && !parents[parent] {
				return fmt.Errorf("missing_fx_parent")
			}
			for _, v := range mapping(p["cues"]) {
				layers := list(v)
				if layers == nil {
					layers = list(mapping(v)["layers"])
				}
				for _, l := range layers {
					if !known[text(mapping(l)["effect"])] {
						return fmt.Errorf("missing_cue_effect")
					}
				}
			}
		}
	}
	return nil
}
