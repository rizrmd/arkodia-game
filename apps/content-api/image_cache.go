package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	stddraw "image/draw"
	"image/gif"
	"math"

	"golang.org/x/image/draw"
	"net/http"

	"github.com/gen2brain/webp"
)

// Serialize expensive codecs, bounding peak memory and coalescing cache misses.
var imageEncoder = make(chan struct{}, 1)

const imageCodec = "webp-lossy-q85-delivery-v4"

// Fit WebP dimensions and the output raster budget without changing aspect ratio.
func webPDimensions(w, h int) (int, int) {
	scale := math.Min(1, math.Min(16383/float64(w), 16383/float64(h)))
	// Preserve sprite/atlas pixel coordinates; only WebP dimension limits apply.
	return max(1, int(float64(w)*scale)), max(1, int(float64(h)*scale))
}

// Delivery defaults to WebP, including backend requests with Accept: */*.
// Byte-integrity consumers must explicitly opt into original source bytes.
func wantsWebP(r *http.Request) bool {
	return r.URL.Query().Get("format") != "original"
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
			canvas := image.NewNRGBA(image.Rect(0, 0, anim.Config.Width, anim.Config.Height))
			frames := &webp.WEBP{LoopCount: anim.LoopCount}
			if frames.LoopCount < 0 {
				frames.LoopCount = 1
			}
			for i, frame := range anim.Image {
				previous := image.NewNRGBA(canvas.Bounds())
				copy(previous.Pix, canvas.Pix)
				stddraw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, stddraw.Over)
				snapshot := image.NewNRGBA(canvas.Bounds())
				copy(snapshot.Pix, canvas.Pix)
				frames.Image = append(frames.Image, snapshot)
				frames.Delay = append(frames.Delay, max(10, anim.Delay[i]*10))
				if i < len(anim.Disposal) {
					switch anim.Disposal[i] {
					case gif.DisposalBackground:
						stddraw.Draw(canvas, frame.Bounds(), image.Transparent, image.Point{}, stddraw.Src)
					case gif.DisposalPrevious:
						copy(canvas.Pix, previous.Pix)
					}
				}
			}
			var out bytes.Buffer
			if err := webp.EncodeAll(&out, frames, webp.Options{Quality: 85, Exact: true, Method: 4}); err != nil {
				return nil, err
			}
			b := out.Bytes()
			_, err = a.query(ctx).Exec(ctx, "INSERT INTO content_image_cache(source_sha256,codec,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", key, imageCodec, b)
			return b, err
		}
	}
	if media == "image/webp" && len(original) > 20 && bytes.Contains(original[:min(len(original), 64)], []byte("ANIM")) {
		return original, nil
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
	if err = webp.Encode(&out, img, webp.Options{Quality: 85, Exact: true, Method: 4}); err != nil {
		return nil, err
	}
	b := out.Bytes()
	_, err = a.query(ctx).Exec(ctx, "INSERT INTO content_image_cache(source_sha256,codec,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", key, imageCodec, b)
	return b, err
}
