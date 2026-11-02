package main

import (
	"bytes"
	"context"
	"github.com/gen2brain/webp"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestWebPDeliveryAndPersistentCache(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "cache.db")
	a, err := openAPI(ctx, dsn, "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	img := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	img.SetNRGBA(3, 4, color.NRGBA{R: 200, G: 100, A: 128})
	var raw bytes.Buffer
	png.Encode(&raw, img)
	original := raw.Bytes()
	key := hash(original)
	if err = a.Objects.Put(ctx, key, original); err != nil {
		t.Fatal(err)
	}
	if _, err = a.DB.ExecContext(ctx, "INSERT INTO content_assets(sha256,size,media_type) VALUES(?,?,?)", key, len(original), "image/png"); err != nil {
		t.Fatal(err)
	}
	serve := func(accept, query, etag, method string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/v1/assets/"+key+query, nil)
		r.Header.Set("Accept", accept)
		r.Header.Set("If-None-Match", etag)
		w := httptest.NewRecorder()
		a.serveAsset(w, r, key, true)
		return w
	}
	w := serve("", "?format=original", "", "GET")
	if !bytes.Equal(w.Body.Bytes(), original) {
		t.Fatal("original checksum contract changed")
	}
	w = serve("", "", "", "GET")
	if w.Code != 200 || w.Header().Get("Content-Type") != "image/webp" {
		t.Fatalf("conversion: %d %s", w.Code, w.Body.String())
	}
	converted := append([]byte(nil), w.Body.Bytes()...)
	etag := w.Header().Get("ETag")
	cfg, _, err := image.DecodeConfig(bytes.NewReader(converted))
	if err != nil || cfg.Width != 64 || cfg.Height != 64 {
		t.Fatalf("dimensions: %v", err)
	}
	decoded, _, err := image.Decode(bytes.NewReader(converted))
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, alpha := decoded.At(3, 4).RGBA()
	if alpha == 0 || alpha == 65535 {
		t.Fatal("alpha lost")
	}
	if w.Header().Get("Vary") != "Accept" || w.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatal("cache headers")
	}
	if serve("image/webp", "", etag, "GET").Code != 304 {
		t.Fatal("conditional GET")
	}
	if serve("image/webp", "", "", "HEAD").Body.Len() != 0 {
		t.Fatal("HEAD body")
	}
	if serve("*/*", "", "", "GET").Header().Get("Content-Type") != "image/webp" {
		t.Fatal("backend request did not default to WebP")
	}
	if !bytes.Equal(serve("image/webp", "?format=original", "", "GET").Body.Bytes(), original) {
		t.Fatal("original override")
	}
	a.DB.Close()
	a, err = openAPI(ctx, dsn, "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.DB.Close()
	cached, err := a.cachedWebP(ctx, key, []byte("invalid input proves no re-encoding"), "image/png")
	if err != nil || !bytes.Equal(cached, converted) {
		t.Fatalf("persistent cache miss: %v", err)
	}
}

func TestOversizedWebPResizeAndCache(t *testing.T) {
	for _, size := range [][4]int{
		{6400, 6400, 6400, 6400},
		{20000, 2, 16383, 1},
		{2, 20000, 1, 16383},
		{64, 32, 64, 32},
	} {
		w, h := webPDimensions(size[0], size[1])
		if w != size[2] || h != size[3] {
			t.Fatalf("%v: got %dx%d", size, w, h)
		}
	}
	ctx := context.Background()
	a, err := openAPI(ctx, filepath.Join(t.TempDir(), "resize.db"), "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.DB.Close()
	img := image.NewNRGBA(image.Rect(0, 0, 20000, 2))
	for x := 0; x < 20000; x++ {
		for y := 0; y < 2; y++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 200, A: 128})
		}
	}
	var raw bytes.Buffer
	if err := png.Encode(&raw, img); err != nil {
		t.Fatal(err)
	}
	key := hash(raw.Bytes())
	if _, err := a.DB.ExecContext(ctx, "INSERT INTO content_assets(sha256,size,media_type) VALUES(?,?,?)", key, raw.Len(), "image/png"); err != nil {
		t.Fatal(err)
	}
	converted, err := a.cachedWebP(ctx, key, raw.Bytes(), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	decoded, _, err := image.Decode(bytes.NewReader(converted))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Dx() != 16383 || decoded.Bounds().Dy() != 1 {
		t.Fatalf("unexpected size: %v", decoded.Bounds())
	}
	_, _, _, alpha := decoded.At(100, 0).RGBA()
	if alpha == 0 || alpha == 65535 {
		t.Fatal("resized alpha lost")
	}
	cached, err := a.cachedWebP(ctx, key, []byte("invalid source"), "image/png")
	if err != nil || !bytes.Equal(cached, converted) {
		t.Fatalf("resized cache miss: %v", err)
	}
}

func TestAnimatedGIFDefaultsToAnimatedWebP(t *testing.T) {
	ctx := context.Background()
	a, err := openAPI(ctx, filepath.Join(t.TempDir(), "animated.db"), "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.DB.Close()
	palette := color.Palette{color.Transparent, color.NRGBA{R: 255, A: 255}, color.NRGBA{B: 255, A: 255}}
	first := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	first.SetColorIndex(0, 0, 1)
	second := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	second.SetColorIndex(1, 1, 2)
	var source bytes.Buffer
	if err := gif.EncodeAll(&source, &gif.GIF{Image: []*image.Paletted{first, second}, Delay: []int{10, 20}, LoopCount: 0, Disposal: []byte{gif.DisposalBackground, gif.DisposalNone}}); err != nil {
		t.Fatal(err)
	}
	key := hash(source.Bytes())
	if err := a.Objects.Put(ctx, key, source.Bytes()); err != nil {
		t.Fatal(err)
	}
	if _, err := a.DB.ExecContext(ctx, "INSERT INTO content_assets(sha256,size,media_type) VALUES(?,?,?)", key, source.Len(), "image/gif"); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/v1/assets/"+key, nil)
	w := httptest.NewRecorder()
	a.serveAsset(w, r, key, true)
	if w.Code != 200 || w.Header().Get("Content-Type") != "image/webp" {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	anim, err := webp.DecodeAll(bytes.NewReader(w.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if len(anim.Image) != 2 || anim.Delay[0] != 100 || anim.Delay[1] != 200 {
		t.Fatalf("animation changed: %+v", anim)
	}
	_, _, _, alpha := anim.Image[1].At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("GIF disposal lost")
	}
}
