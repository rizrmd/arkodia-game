package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Serialize expensive codecs, bounding peak memory and coalescing cache misses.
var audioEncoder = make(chan struct{}, 1)

const (
	audioCodec = "mp3-lame-q5-delivery-v1"
	audioMime  = "audio/mpeg"
)

func isOptimizableAudio(media string) bool {
	switch strings.ToLower(media) {
	case "audio/wave", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac":
		return true
	default:
		return false
	}
}

func findFFmpeg() (string, error) {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p, nil
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidate := filepath.Join(home, ".local", "bin", "ffmpeg")
		if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", errors.New("ffmpeg not found")
}

func transcodeAudioToMP3(ctx context.Context, original []byte) ([]byte, error) {
	ffmpeg, err := findFFmpeg()
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(
		ctx,
		ffmpeg,
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-vn",
		"-c:a", "libmp3lame",
		"-q:a", "5",
		"-ar", "44100",
		"-f", "mp3",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(original)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg audio transcode failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	b := stdout.Bytes()
	if len(b) == 0 {
		return nil, errors.New("ffmpeg produced empty audio output")
	}
	return b, nil
}

func (a *API) cachedAudio(ctx context.Context, key string, original []byte, media string) ([]byte, string, error) {
	if !isOptimizableAudio(media) {
		return nil, "", nil
	}
	read := func() ([]byte, error) {
		var b []byte
		err := a.query(ctx).QueryRow(ctx, "SELECT data FROM content_audio_cache WHERE source_sha256=$1 AND codec=$2", key, audioCodec).Scan(&b)
		return b, err
	}
	if b, err := read(); err == nil {
		return b, audioMime, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, "", err
	}
	select {
	case audioEncoder <- struct{}{}:
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
	defer func() { <-audioEncoder }()
	if b, err := read(); err == nil {
		return b, audioMime, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, "", err
	}
	b, err := transcodeAudioToMP3(ctx, original)
	if err != nil {
		return nil, "", err
	}
	_, err = a.query(ctx).Exec(ctx, "INSERT INTO content_audio_cache(source_sha256,codec,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", key, audioCodec, b)
	return b, audioMime, err
}
