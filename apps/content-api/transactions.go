package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

type transactionKey struct{}

type queryDB interface {
	Exec(context.Context, string, ...any) (sql.Result, error)
	Query(context.Context, string, ...any) (*sql.Rows, error)
	QueryRow(context.Context, string, ...any) *sql.Row
}

type txDB interface {
	queryDB
	Commit(context.Context) error
	Rollback(context.Context) error
}

type sqlQueryAdapter struct {
	exec     func(context.Context, string, ...any) (sql.Result, error)
	query    func(context.Context, string, ...any) (*sql.Rows, error)
	queryRow func(context.Context, string, ...any) *sql.Row
}

func (s sqlQueryAdapter) Exec(ctx context.Context, q string, args ...any) (sql.Result, error) {
	return s.exec(ctx, q, args...)
}
func (s sqlQueryAdapter) Query(ctx context.Context, q string, args ...any) (*sql.Rows, error) {
	return s.query(ctx, q, args...)
}
func (s sqlQueryAdapter) QueryRow(ctx context.Context, q string, args ...any) *sql.Row {
	return s.queryRow(ctx, q, args...)
}

type sqlTxAdapter struct {
	sqlQueryAdapter
	tx       *sql.Tx
	savept   bool
	finished bool
}

func (t *sqlTxAdapter) Commit(ctx context.Context) error {
	if t.finished {
		return nil
	}
	t.finished = true
	if t.savept {
		_, err := t.tx.ExecContext(ctx, "RELEASE SAVEPOINT content_nested")
		return err
	}
	return t.tx.Commit()
}

func (t *sqlTxAdapter) Rollback(ctx context.Context) error {
	if t.finished {
		return nil
	}
	t.finished = true
	if t.savept {
		_, err := t.tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT content_nested")
		_, _ = t.tx.ExecContext(ctx, "RELEASE SAVEPOINT content_nested")
		return err
	}
	return t.tx.Rollback()
}

func wrapTx(tx *sql.Tx, savept bool) *sqlTxAdapter {
	return &sqlTxAdapter{
		sqlQueryAdapter: sqlQueryAdapter{
			exec:     tx.ExecContext,
			query:    tx.QueryContext,
			queryRow: tx.QueryRowContext,
		},
		tx:     tx,
		savept: savept,
	}
}

func (a *API) query(ctx context.Context) queryDB {
	if tx, ok := ctx.Value(transactionKey{}).(*sql.Tx); ok {
		return sqlQueryAdapter{
			exec:     tx.ExecContext,
			query:    tx.QueryContext,
			queryRow: tx.QueryRowContext,
		}
	}
	return sqlQueryAdapter{
		exec:     a.DB.ExecContext,
		query:    a.DB.QueryContext,
		queryRow: a.DB.QueryRowContext,
	}
}

func (a *API) begin(ctx context.Context) (txDB, error) {
	if tx, ok := ctx.Value(transactionKey{}).(*sql.Tx); ok {
		if _, err := tx.ExecContext(ctx, "SAVEPOINT content_nested"); err != nil {
			return nil, err
		}
		return wrapTx(tx, true), nil
	}
	tx, err := a.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	return wrapTx(tx, false), nil
}

type responseBuffer struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (b *responseBuffer) Header() http.Header { return b.header }
func (b *responseBuffer) WriteHeader(s int) {
	if b.status == 0 {
		b.status = s
	}
}
func (b *responseBuffer) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = 200
	}
	return b.body.Write(p)
}

// Successful mutation and durable retry response commit in the same SQLite transaction.
func (a *API) idempotent(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" || r.Method == "HEAD" {
			h(w, r)
			return
		}
		key := r.Header.Get("Idempotency-Key")
		if key == "" {
			h(w, r)
			return
		}
		if len(key) > 160 || strings.ContainsAny(key, "\r\n") {
			fail(w, 400, "invalid_idempotency_key")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<20))
		if err != nil {
			fail(w, 413, "request_too_large")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		scope := hash([]byte(r.Header.Get("Authorization")))
		reqHash := hash(append([]byte(r.Method+"\n"+r.URL.RequestURI()+"\n"+r.Header.Get("If-Match")+"\n"), body...))
		tx, err := a.DB.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			fail(w, 503, "database_error")
			return
		}
		defer tx.Rollback()
		var previous string
		var status int
		var headersRaw, b []byte
		err = tx.QueryRowContext(r.Context(), "SELECT request_hash,status,headers,response FROM content_idempotency WHERE scope=$1 AND key=$2", scope, key).Scan(&previous, &status, &headersRaw, &b)
		if err == nil {
			if previous != reqHash {
				fail(w, 409, "idempotency_key_reused")
				return
			}
			var headers http.Header
			json.Unmarshal(headersRaw, &headers)
			for k, v := range headers {
				w.Header()[k] = v
			}
			w.Header().Set("Idempotency-Replayed", "true")
			w.WriteHeader(status)
			w.Write(b)
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			fail(w, 503, "database_error")
			return
		}
		buf := &responseBuffer{header: make(http.Header)}
		h(buf, r.WithContext(context.WithValue(r.Context(), transactionKey{}, tx)))
		if buf.status == 0 {
			buf.status = 200
		}
		if buf.status < 400 {
			headers, _ := json.Marshal(buf.header)
			_, err = tx.ExecContext(r.Context(), "INSERT INTO content_idempotency(scope,key,request_hash,status,headers,response) VALUES($1,$2,$3,$4,$5,$6)", scope, key, reqHash, buf.status, headers, buf.body.Bytes())
			if err == nil {
				err = tx.Commit()
			}
			if err != nil {
				fail(w, 409, "transaction_conflict_retry")
				return
			}
		}
		for k, v := range buf.header {
			w.Header()[k] = v
		}
		w.WriteHeader(buf.status)
		w.Write(buf.body.Bytes())
	}
}
func (a *API) rollbackChannel(w http.ResponseWriter, r *http.Request) {
	channel := r.PathValue("channel")
	var in struct {
		ReleaseID         string `json:"releaseId"`
		ExpectedReleaseID string `json:"expectedReleaseId"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !identifier.MatchString(channel) || in.ExpectedReleaseID == "" || in.ReleaseID == "" {
		fail(w, 400, "invalid_channel_move")
		return
	}
	tx, err := a.begin(r.Context())
	if err != nil {
		fail(w, 503, "database_error")
		return
	}
	defer tx.Rollback(r.Context())
	var exists bool
	if tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM content_releases WHERE id=$1)", in.ReleaseID).Scan(&exists) != nil || !exists {
		fail(w, 404, "release_not_found")
		return
	}
	tag, err := tx.Exec(r.Context(), "UPDATE content_channels SET release_id=$1 WHERE name=$2 AND release_id=$3", in.ReleaseID, channel, in.ExpectedReleaseID)
	if err != nil {
		fail(w, 503, "database_error")
		return
	}
	rows, err := tag.RowsAffected()
	if err != nil || rows != 1 {
		fail(w, 409, "channel_conflict")
		return
	}
	_, err = tx.Exec(r.Context(), "INSERT INTO content_channel_events(channel,previous_release,release_id,action) VALUES($1,$2,$3,'rollback')", channel, in.ExpectedReleaseID, in.ReleaseID)
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		fail(w, 409, "transaction_conflict_retry")
		return
	}
	respond(w, 200, map[string]string{"releaseId": in.ReleaseID})
}
