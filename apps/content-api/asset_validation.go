package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	_ "golang.org/x/image/webp"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"reflect"
)

func glbJSON(b []byte) (map[string]any, error) {
	if len(b) < 20 || string(b[:4]) != "glTF" || binary.LittleEndian.Uint32(b[4:8]) != 2 || int(binary.LittleEndian.Uint32(b[8:12])) != len(b) || string(b[16:20]) != "JSON" {
		return nil, errors.New("invalid_glb_v2")
	}
	n := int(binary.LittleEndian.Uint32(b[12:16]))
	if n > len(b)-20 {
		return nil, errors.New("invalid_glb_chunk")
	}
	var p map[string]any
	if json.Unmarshal(b[20:20+n], &p) != nil {
		return nil, errors.New("invalid_glb_json")
	}
	binLength := 0
	for offset := 20 + n; offset < len(b); {
		if offset+8 > len(b) {
			return nil, errors.New("invalid_glb_chunk")
		}
		length := int(binary.LittleEndian.Uint32(b[offset : offset+4]))
		if length < 0 || offset+8+length > len(b) {
			return nil, errors.New("invalid_glb_chunk")
		}
		if string(b[offset+4:offset+8]) == "BIN\x00" {
			binLength = length
		}
		offset += 8 + length
	}
	buffers, _ := p["buffers"].([]any)
	for i, v := range buffers {
		m, ok := v.(map[string]any)
		if !ok {
			return nil, errors.New("invalid_glb_buffer")
		}
		size, _ := m["byteLength"].(float64)
		if m["uri"] != nil || i != 0 || size > float64(binLength) {
			return nil, errors.New("external_or_truncated_glb_buffer")
		}
	}
	views, _ := p["bufferViews"].([]any)
	for _, v := range views {
		m, ok := v.(map[string]any)
		if !ok {
			return nil, errors.New("invalid_glb_buffer_view")
		}
		offset, _ := m["byteOffset"].(float64)
		size, _ := m["byteLength"].(float64)
		index, _ := m["buffer"].(float64)
		if index != 0 || offset < 0 || size < 0 || offset+size > float64(binLength) {
			return nil, errors.New("glb_buffer_view_out_of_range")
		}
	}
	return p, nil
}
func (a *API) validateBinaryMetadata(ctx context.Context, d Document) error {
	if d.SchemaVersion != 2 {
		return nil
	}
	format, _ := d.Data["format"].(string)
	payload, _ := d.Data["payload"].(map[string]any)
	bindings, _ := d.Data["bindings"].(map[string]any)
	get := func(path string) ([]byte, error) {
		key, _ := bindings[path].(string)
		b, err := a.Objects.Get(ctx, key)
		if err != nil || hash(b) != key {
			return nil, errors.New("asset_unavailable_or_corrupt")
		}
		return b, nil
	}
	raster := func(path string, w, h float64) error {
		b, e := get(path)
		if e != nil {
			return e
		}
		cfg, _, e := image.DecodeConfig(bytes.NewReader(b))
		if e != nil {
			return errors.New("invalid_or_unsupported_raster")
		}
		if w > 0 && (float64(cfg.Width) != w || float64(cfg.Height) != h) {
			return errors.New("raster_dimensions_mismatch")
		}
		return nil
	}
	switch format {
	case "arkadia.character-atlas.v1", "arkadia.equipment-atlas.v1":
		size := payload["atlasSize"].([]any)
		return raster(payload["image"].(string), size[0].(float64), size[1].(float64))
	case "arkadia.environment-catalog.v1":
		for _, v := range payload["assets"].([]any) {
			p := v.(map[string]any)
			if path := p["file"].(string); path != "" {
				if e := raster(path, 0, 0); e != nil {
					return e
				}
			}
		}
	case "arkadia.sprite-sheet.v1":
		b, e := get(payload["source"].(string))
		if e != nil {
			return e
		}
		cfg, _, e := image.DecodeConfig(bytes.NewReader(b))
		if e != nil || float64(cfg.Width) < payload["columns"].(float64) || float64(cfg.Height) < payload["rows"].(float64) {
			return errors.New("sprite_grid_exceeds_raster")
		}
	case "arkadia.hero-glb.v1":
		b, e := get(payload["glb"].(string))
		if e != nil {
			return e
		}
		p, e := glbJSON(b)
		if e != nil {
			return e
		}
		names := map[string]bool{}
		clips, _ := p["animations"].([]any)
		for _, v := range clips {
			m, _ := v.(map[string]any)
			name, _ := m["name"].(string)
			names[name] = true
		}
		for _, v := range payload["animations"].([]any) {
			if !names[v.(map[string]any)["slug"].(string)] {
				return errors.New("glb_animation_missing")
			}
		}
		return raster(payload["thumbnail"].(string), 0, 0)
	case "arkadia.gltf.v2":
		b, e := get("$glb")
		if e != nil {
			return e
		}
		p, e := glbJSON(b)
		if e != nil {
			return e
		}
		if !reflect.DeepEqual(p, payload) {
			return errors.New("glb_metadata_mismatch")
		}
	case "arkadia.asset-manifest.v1":
		for _, v := range payload["entries"].([]any) {
			p := v.(map[string]any)
			var size int64
			var mime string
			if err := a.query(ctx).QueryRow(ctx, "SELECT size,media_type FROM content_assets WHERE sha256=$1", p["sha256"]).Scan(&size, &mime); err != nil {
				return errors.New("asset_metadata_missing")
			}
			if float64(size) != p["size"].(float64) || mime != p["mediaType"].(string) || bindings[p["path"].(string)] != p["sha256"] {
				return errors.New("asset_manifest_metadata_mismatch")
			}
		}
	}
	// ValidateV2 has already established every runtime path has a declared binding.
	return nil
}
