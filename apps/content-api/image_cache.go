package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/gif"
	"math"

	"golang.org/x/image/draw"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/gen2brain/webp"
)

// Serialize expensive codecs, bounding peak memory and coalescing cache misses.
var imageEncoder = make(chan struct{}, 1)

const imageCodec = "webp-q90-resize-v2"

// Fit WebP dimensions and the output raster budget without changing aspect ratio.
func webPDimensions(w, h int) (int, int) {
	scale := math.Min(1, math.Min(16383/float64(w), 16383/float64(h)))
	scale = math.Min(scale, math.Sqrt(32_000_000/(float64(w)*float64(h))))
	return max(1, int(float64(w)*scale)), max(1, int(float64(h)*scale))
}

func wantsWebP(r *http.Request) bool {
	if f := r.URL.Query().Get("format"); f != "" {
		return f == "webp"
	}
	for _, item := range strings.Split(r.Header.Get("Accept"), ",") {
		media, params, err := mime.ParseMediaType(strings.TrimSpace(item))
		if err != nil || media != "image/webp" {
			continue
		}
		if q, ok := params["q"]; ok {
			v, err := strconv.ParseFloat(q, 64)
			return err == nil && v > 0 && v <= 1
		}
		return true
	}
	return false
}

func (a *API) cachedWebP(ctx context.Context, key string, original []byte, media string) ([]byte, error) {
	read := func() ([]byte, error) {
		var b []byte
		err := a.query(ctx).QueryRow(ctx, "SELECT data FROM content_image_cache WHERE source_sha256=$1 AND codec=$2", key, imageCodec).Scan(&b)
		return b, err
	}
	if b, err := read(); err == nil {
		return b, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	select {
	case imageEncoder <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	defer func() { <-imageEncoder }()
	if b, err := read(); err == nil {
		return b, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil {
		return nil, err
	}
	width, height := webPDimensions(cfg.Width, cfg.Height)
	// Keep animations intact rather than silently flattening them.
	if media == "image/gif" {
		anim, err := gif.DecodeAll(bytes.NewReader(original))
		if err != nil {
			return nil, err
		}
		if len(anim.Image) > 1 {
			return nil, nil
		}
	}
	if media == "image/webp" && len(original) > 20 && bytes.Contains(original[:min(len(original), 64)], []byte("ANIM")) {
		return nil, nil
	}
	img, _, err := image.Decode(bytes.NewReader(original))
	if err != nil {
		return nil, err
	}
	if width != cfg.Width || height != cfg.Height {
		resized := image.NewNRGBA(image.Rect(0, 0, width, height))
		draw.ApproxBiLinear.Scale(resized, resized.Bounds(), img, img.Bounds(), draw.Src, nil)
		img = resized
	}
	var out bytes.Buffer
	if err = webp.Encode(&out, img, webp.Options{Quality: 90, Method: 4}); err != nil {
		return nil, err
	}
	b := out.Bytes()
	_, err = a.query(ctx).Exec(ctx, "INSERT INTO content_image_cache(source_sha256,codec,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", key, imageCodec, b)
	return b, err
}
