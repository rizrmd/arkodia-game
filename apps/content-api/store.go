package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"io"
	"os"
	"path/filepath"
)

// Objects are addressed only by SHA-256, never user-controlled filesystem paths.
type Objects interface {
	Put(context.Context, string, []byte) error
	Get(context.Context, string) ([]byte, error)
}
type DiskObjects struct{ Root string }

func (d DiskObjects) Put(_ context.Context, k string, b []byte) error {
	if err := os.MkdirAll(d.Root, 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(d.Root, "upload-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), filepath.Join(d.Root, k))
}
func (d DiskObjects) Get(_ context.Context, k string) ([]byte, error) {
	return os.ReadFile(filepath.Join(d.Root, k))
}

type SQLiteObjects struct {
	API         *API
	FallbackDir string
}

func (s SQLiteObjects) Put(ctx context.Context, k string, b []byte) error {
	if s.FallbackDir != "" {
		if err := (DiskObjects{Root: s.FallbackDir}).Put(ctx, k, b); err != nil {
			return err
		}
	}
	_, err := s.API.query(ctx).Exec(ctx, "INSERT INTO content_asset_objects(sha256,data) VALUES($1,$2) ON CONFLICT(sha256) DO UPDATE SET data=excluded.data,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", k, b)
	return err
}
func (s SQLiteObjects) Get(ctx context.Context, k string) ([]byte, error) {
	var b []byte
	err := s.API.query(ctx).QueryRow(ctx, "SELECT data FROM content_asset_objects WHERE sha256=$1", k).Scan(&b)
	if err == nil {
		return b, nil
	}
	if !errors.Is(err, sql.ErrNoRows) || s.FallbackDir == "" {
		return nil, err
	}
	return os.ReadFile(filepath.Join(s.FallbackDir, k))
}

type S3Objects struct {
	Client *minio.Client
	Bucket string
}

func (s S3Objects) Put(ctx context.Context, k string, b []byte) error {
	_, err := s.Client.PutObject(ctx, s.Bucket, k, bytes.NewReader(b), int64(len(b)), minio.PutObjectOptions{ContentType: "application/octet-stream"})
	return err
}
func (s S3Objects) Get(ctx context.Context, k string) ([]byte, error) {
	o, err := s.Client.GetObject(ctx, s.Bucket, k, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer o.Close()
	return io.ReadAll(io.LimitReader(o, 16<<20))
}
func objectsFromEnv() (Objects, error) {
	if endpoint := os.Getenv("S3_ENDPOINT"); endpoint != "" {
		if os.Getenv("S3_ACCESS_KEY") == "" || os.Getenv("S3_SECRET_KEY") == "" || os.Getenv("S3_BUCKET") == "" {
			return nil, errors.New("S3 configuration incomplete")
		}
		c, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), ""), Secure: os.Getenv("S3_INSECURE") != "true"})
		if err != nil {
			return nil, err
		}
		return S3Objects{c, os.Getenv("S3_BUCKET")}, nil
	}
	return SQLiteObjects{FallbackDir: os.Getenv("ASSET_DIR")}, nil
}
