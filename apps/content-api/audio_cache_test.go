package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func makeTestWAV(seconds float64, sampleRate int) []byte {
	channels := 2
	bitsPerSample := 16
	numSamples := int(float64(sampleRate) * seconds)
	dataSize := numSamples * channels * (bitsPerSample / 8)
	var buf bytes.Buffer
	buf.WriteString("RIFF")
	binary.Write(&buf, binary.LittleEndian, uint32(36+dataSize))
	buf.WriteString("WAVEfmt ")
	binary.Write(&buf, binary.LittleEndian, uint32(16))
	binary.Write(&buf, binary.LittleEndian, uint16(1))
	binary.Write(&buf, binary.LittleEndian, uint16(channels))
	binary.Write(&buf, binary.LittleEndian, uint32(sampleRate))
	binary.Write(&buf, binary.LittleEndian, uint32(sampleRate*channels*(bitsPerSample/8)))
	binary.Write(&buf, binary.LittleEndian, uint16(channels*(bitsPerSample/8)))
	binary.Write(&buf, binary.LittleEndian, uint16(bitsPerSample))
	buf.WriteString("data")
	binary.Write(&buf, binary.LittleEndian, uint32(dataSize))
	for i := 0; i < numSamples; i++ {
		env := math.Exp(-3.0 * float64(i) / float64(numSamples))
		v := int16(16000 * math.Sin(2*math.Pi*440*float64(i)/float64(sampleRate)) * env)
		binary.Write(&buf, binary.LittleEndian, v)
		binary.Write(&buf, binary.LittleEndian, v)
	}
	return buf.Bytes()
}

func TestAudioDeliveryAndPersistentCache(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "audio-cache.db")
	a, err := openAPI(ctx, dsn, "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	original := makeTestWAV(1.5, 44100)
	key := hash(original)
	if err = a.Objects.Put(ctx, key, original); err != nil {
		t.Fatal(err)
	}
	if _, err = a.DB.ExecContext(ctx, "INSERT INTO content_assets(sha256,size,media_type) VALUES(?,?,?)", key, len(original), "audio/wave"); err != nil {
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

	// ?format=original preserves raw WAV bytes.
	w := serve("", "?format=original", "", "GET")
	if w.Code != 200 || w.Header().Get("Content-Type") != "audio/wave" || !bytes.Equal(w.Body.Bytes(), original) {
		t.Fatalf("original audio contract changed: code=%d mime=%s len=%d", w.Code, w.Header().Get("Content-Type"), w.Body.Len())
	}

	// Default delivery converts WAV to tiny MP3.
	w = serve("", "", "", "GET")
	if w.Code != 200 || w.Header().Get("Content-Type") != "audio/mpeg" {
		t.Fatalf("audio conversion failed: %d %s %s", w.Code, w.Header().Get("Content-Type"), w.Body.String())
	}
	converted := append([]byte(nil), w.Body.Bytes()...)
	if len(converted) == 0 || len(converted) >= len(original)/4 {
		t.Fatalf("expected significant compression: original=%d converted=%d", len(original), len(converted))
	}
	etag := w.Header().Get("ETag")
	if w.Header().Get("Vary") != "Accept" || w.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatal("cache headers")
	}
	if serve("audio/mpeg", "", etag, "GET").Code != 304 {
		t.Fatal("conditional GET")
	}
	if serve("audio/mpeg", "", "", "HEAD").Body.Len() != 0 {
		t.Fatal("HEAD body")
	}
	if serve("*/*", "", "", "GET").Header().Get("Content-Type") != "audio/mpeg" {
		t.Fatal("backend request did not default to optimized audio")
	}
	if !bytes.Equal(serve("audio/mpeg", "?format=original", "", "GET").Body.Bytes(), original) {
		t.Fatal("original override")
	}

	// Persistent SQLite cache survives restart without re-encoding.
	a.DB.Close()
	a, err = openAPI(ctx, dsn, "test-token-at-least-32-characters-long", "https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.DB.Close()
	cached, mime, err := a.cachedAudio(ctx, key, []byte("invalid input proves no re-encoding"), "audio/wave")
	if err != nil || mime != "audio/mpeg" || !bytes.Equal(cached, converted) {
		t.Fatalf("persistent audio cache miss: err=%v mime=%s", err, mime)
	}

	// Already compressed audio/mpeg is passed through untouched.
	mp3Key := hash(converted)
	if err = a.Objects.Put(ctx, mp3Key, converted); err != nil {
		t.Fatal(err)
	}
	if _, err = a.DB.ExecContext(ctx, "INSERT INTO content_assets(sha256,size,media_type) VALUES(?,?,?)", mp3Key, len(converted), "audio/mpeg"); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/v1/assets/"+mp3Key, nil)
	w = httptest.NewRecorder()
	a.serveAsset(w, r, mp3Key, true)
	if w.Code != 200 || w.Header().Get("Content-Type") != "audio/mpeg" || !bytes.Equal(w.Body.Bytes(), converted) {
		t.Fatalf("mp3 passthrough failed: %d %s", w.Code, w.Header().Get("Content-Type"))
	}
}
