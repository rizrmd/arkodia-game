package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"
)

//go:embed schema.sql
var ddl string
var identifier = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var digest = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Document struct {
	SchemaVersion int            `json:"schemaVersion"`
	Kind          string         `json:"kind"`
	Name          string         `json:"name"`
	Assets        []string       `json:"assets"`
	Data          map[string]any `json:"data"`
}
type Draft struct {
	ID       string          `json:"id"`
	Revision int64           `json:"revision"`
	Document json.RawMessage `json:"document"`
}
type Selection struct {
	ID       string `json:"id"`
	Revision int64  `json:"revision"`
}
type ReleaseRequest struct {
	Channel   string      `json:"channel"`
	Documents []Selection `json:"documents"`
}
type Asset struct {
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	MediaType string `json:"mediaType"`
	URL       string `json:"url"`
}
type Entry struct {
	ID       string `json:"id"`
	Revision int64  `json:"revision"`
	SHA256   string `json:"sha256"`
	URL      string `json:"url"`
}
type Manifest struct {
	SchemaVersion int     `json:"schemaVersion"`
	ID            string  `json:"id"`
	CreatedAt     string  `json:"createdAt"`
	Documents     []Entry `json:"documents"`
	Assets        []Asset `json:"assets"`
}
type API struct {
	DB        *pgxpool.Pool
	Objects   Objects
	Token     string
	PublicURL string
	Schema    *jsonschema.Schema
	Origins   map[string]bool
}

func hash(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code string) {
	respond(w, status, map[string]string{"error": code})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		fail(w, 400, "invalid_json")
		return false
	}
	if d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_json")
		return false
	}
	return true
}
func (a *API) auth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") || a.Token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(a.Token)) != 1 {
			fail(w, 401, "unauthorized")
			return
		}
		h(w, r)
	}
}
func (a *API) handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]string{"service": "Arkodia Content API", "version": "1", "health": "/healthz", "schema": "/contracts/document.schema.json"})
	})
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if a.DB.Ping(ctx) != nil {
			fail(w, 503, "database_unavailable")
			return
		}
		respond(w, 200, map[string]string{"status": "ok"})
	})
	m.HandleFunc("GET /contracts/document.schema.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/schema+json")
		io.WriteString(w, contracts.DocumentSchema)
	})
	m.HandleFunc("GET /v1/drafts", a.auth(a.listDrafts))
	m.HandleFunc("GET /v1/drafts/{id}", a.auth(a.getDraft))
	m.HandleFunc("PUT /v1/drafts/{id}", a.auth(a.saveDraft))
	m.HandleFunc("DELETE /v1/drafts/{id}", a.auth(a.deleteDraft))
	m.HandleFunc("POST /v1/assets", a.auth(a.upload))
	m.HandleFunc("GET /v1/assets/{sha}", a.auth(a.previewAsset))
	m.HandleFunc("POST /v1/releases", a.auth(a.publish))
	m.HandleFunc("GET /v1/channels/{channel}", a.channel)
	m.HandleFunc("GET /v1/releases/{release}", a.manifest)
	m.HandleFunc("GET /v1/releases/{release}/documents/{id}", a.publishedDocument)
	m.HandleFunc("GET /v1/releases/{release}/assets/{sha}", a.publishedAsset)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if origin := r.Header.Get("Origin"); origin != "" && a.Origins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
			w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, POST, OPTIONS")
			w.Header().Set("Access-Control-Expose-Headers", "ETag")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		m.ServeHTTP(w, r.WithContext(ctx))
	})
}
func (a *API) listDrafts(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.Query(r.Context(), "SELECT id,revision,document FROM content_drafts ORDER BY id LIMIT 1000")
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	defer rows.Close()
	out := []Draft{}
	for rows.Next() {
		var d Draft
		if rows.Scan(&d.ID, &d.Revision, &d.Document) != nil {
			fail(w, 500, "database_error")
			return
		}
		out = append(out, d)
	}
	if rows.Err() != nil {
		fail(w, 500, "database_error")
		return
	}
	respond(w, 200, out)
}
func (a *API) getDraft(w http.ResponseWriter, r *http.Request) {
	var d Draft
	err := a.DB.QueryRow(r.Context(), "SELECT id,revision,document FROM content_drafts WHERE id=$1", r.PathValue("id")).Scan(&d.ID, &d.Revision, &d.Document)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "draft_not_found")
		return
	}
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	w.Header().Set("ETag", fmt.Sprintf(`"%d"`, d.Revision))
	respond(w, 200, d)
}
func (a *API) validate(ctx context.Context, raw json.RawMessage) (Document, error) {
	var value any
	var d Document
	if json.Unmarshal(raw, &value) != nil {
		return d, errors.New("invalid_document")
	}
	if err := a.Schema.Validate(value); err != nil {
		return d, errors.New("schema_validation_failed")
	}
	if json.Unmarshal(raw, &d) != nil {
		return d, errors.New("invalid_document")
	}
	allowed := map[string]bool{}
	for _, s := range d.Assets {
		allowed[s] = true
		var exists bool
		if err := a.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM content_assets WHERE sha256=$1)", s).Scan(&exists); err != nil {
			return d, err
		}
		if !exists {
			return d, errors.New("asset_not_found")
		}
	}
	// Every frame reference must be declared in the manifest's asset list.
	if frames, ok := d.Data["frames"].([]any); ok {
		for _, f := range frames {
			if !allowed[f.(map[string]any)["asset"].(string)] {
				return d, errors.New("undeclared_frame_asset")
			}
		}
	}
	return d, nil
}
func (a *API) saveDraft(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !identifier.MatchString(id) {
		fail(w, 400, "invalid_id")
		return
	}
	var in struct {
		Revision int64           `json:"revision"`
		Document json.RawMessage `json:"document"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Revision < 0 {
		fail(w, 400, "invalid_revision")
		return
	}
	doc, err := a.validate(r.Context(), in.Document)
	if err != nil {
		fail(w, 422, err.Error())
		return
	}
	var rev int64
	if in.Revision == 0 {
		err = a.DB.QueryRow(r.Context(), "INSERT INTO content_drafts(id,kind,revision,document) VALUES($1,$2,1,$3) ON CONFLICT DO NOTHING RETURNING revision", id, doc.Kind, in.Document).Scan(&rev)
	} else {
		err = a.DB.QueryRow(r.Context(), "UPDATE content_drafts SET document=$1,revision=revision+1,updated_at=now() WHERE id=$2 AND revision=$3 AND kind=$4 RETURNING revision", in.Document, id, in.Revision, doc.Kind).Scan(&rev)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 409, "revision_conflict")
		return
	}
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	w.Header().Set("ETag", fmt.Sprintf(`"%d"`, rev))
	respond(w, 200, Draft{id, rev, in.Document})
}
func (a *API) deleteDraft(w http.ResponseWriter, r *http.Request) {
	var rev int64
	if _, err := fmt.Sscanf(r.Header.Get("If-Match"), `"%d"`, &rev); err != nil || rev < 1 {
		fail(w, 428, "quoted_revision_if_match_required")
		return
	}
	tag, err := a.DB.Exec(r.Context(), "DELETE FROM content_drafts WHERE id=$1 AND revision=$2", r.PathValue("id"), rev)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	if tag.RowsAffected() != 1 {
		fail(w, 409, "revision_conflict")
		return
	}
	w.WriteHeader(204)
}
func (a *API) upload(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<20))
	if err != nil || len(b) == 0 {
		fail(w, 413, "asset_size_invalid")
		return
	}
	mime := http.DetectContentType(b)
	switch mime {
	case "image/png", "image/jpeg", "image/gif", "image/webp", "audio/ogg", "audio/wave", "audio/mpeg", "video/webm", "application/octet-stream":
	default:
		fail(w, 415, "unsupported_asset_type")
		return
	}
	key := hash(b)
	if err = a.Objects.Put(r.Context(), key, b); err != nil {
		fail(w, 503, "object_store_error")
		return
	}
	_, err = a.DB.Exec(r.Context(), "INSERT INTO content_assets(sha256,size,media_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", key, len(b), mime)
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	respond(w, 201, Asset{key, int64(len(b)), mime, "/v1/assets/" + key})
}
func (a *API) previewAsset(w http.ResponseWriter, r *http.Request) {
	a.serveAsset(w, r, r.PathValue("sha"), false)
}
func (a *API) serveAsset(w http.ResponseWriter, r *http.Request, key string, public bool) {
	if !digest.MatchString(key) {
		fail(w, 404, "asset_not_found")
		return
	}
	var mime string
	if a.DB.QueryRow(r.Context(), "SELECT media_type FROM content_assets WHERE sha256=$1", key).Scan(&mime) != nil {
		fail(w, 404, "asset_not_found")
		return
	}
	b, err := a.Objects.Get(r.Context(), key)
	if err != nil {
		fail(w, 503, "object_store_error")
		return
	}
	if hash(b) != key {
		fail(w, 503, "asset_integrity_error")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Length", fmt.Sprint(len(b)))
	if public {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	w.Header().Set("ETag", `"`+key+`"`)
	w.Write(b)
}
func (a *API) publish(w http.ResponseWriter, r *http.Request) {
	var in ReleaseRequest
	if !decode(w, r, &in) {
		return
	}
	if !identifier.MatchString(in.Channel) || len(in.Documents) == 0 || len(in.Documents) > 1000 {
		fail(w, 400, "invalid_release_selection")
		return
	}
	tx, err := a.DB.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(w, 500, "database_error")
		return
	}
	defer tx.Rollback(r.Context())
	// Sorting gives stable lock order for competing publications.
	sort.Slice(in.Documents, func(i, j int) bool { return in.Documents[i].ID < in.Documents[j].ID })
	drafts := []Draft{}
	assetSet := map[string]bool{}
	selected := map[string]string{}
	for _, s := range in.Documents {
		if !identifier.MatchString(s.ID) || s.Revision < 1 || selected[s.ID] != "" {
			fail(w, 400, "invalid_release_selection")
			return
		}
		var d Draft
		err = tx.QueryRow(r.Context(), "SELECT id,revision,document FROM content_drafts WHERE id=$1 FOR SHARE", s.ID).Scan(&d.ID, &d.Revision, &d.Document)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && d.Revision != s.Revision {
			fail(w, 409, "revision_conflict")
			return
		}
		if err != nil {
			fail(w, 500, "database_error")
			return
		}
		var doc Document
		if json.Unmarshal(d.Document, &doc) != nil {
			fail(w, 500, "invalid_stored_document")
			return
		}
		selected[s.ID] = doc.Kind
		drafts = append(drafts, d)
		for _, key := range doc.Assets {
			assetSet[key] = true
		}
	}
	// Character animation references must resolve within this complete release.
	for _, d := range drafts {
		var doc Document
		_ = json.Unmarshal(d.Document, &doc)
		if doc.Kind == "character" {
			refs, _ := doc.Data["animations"].(map[string]any)
			for _, v := range refs {
				if selected[v.(string)] != "animation" {
					fail(w, 422, "animation_reference_missing_from_release")
					return
				}
			}
		}
	}
	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		fail(w, 500, "entropy_error")
		return
	}
	release := hex.EncodeToString(random)
	base := a.PublicURL + "/v1/releases/" + release
	manifest := Manifest{1, release, time.Now().UTC().Format(time.RFC3339Nano), []Entry{}, []Asset{}}
	for _, d := range drafts {
		manifest.Documents = append(manifest.Documents, Entry{d.ID, d.Revision, hash(d.Document), base + "/documents/" + d.ID})
	}
	keys := []string{}
	for k := range assetSet {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		asset := Asset{SHA256: key, URL: base + "/assets/" + key}
		if err = tx.QueryRow(r.Context(), "SELECT size,media_type FROM content_assets WHERE sha256=$1", key).Scan(&asset.Size, &asset.MediaType); err != nil {
			fail(w, 422, "asset_not_found")
			return
		}
		b, e := a.Objects.Get(r.Context(), key)
		if e != nil || int64(len(b)) != asset.Size || hash(b) != key {
			fail(w, 422, "asset_unavailable_or_corrupt")
			return
		}
		manifest.Assets = append(manifest.Assets, asset)
	}
	body, _ := json.Marshal(manifest)
	_, err = tx.Exec(r.Context(), "INSERT INTO content_releases(id,manifest) VALUES($1,$2)", release, body)
	if err == nil {
		for _, d := range drafts {
			_, err = tx.Exec(r.Context(), "INSERT INTO content_release_documents(release_id,document_id,revision,document) VALUES($1,$2,$3,$4)", release, d.ID, d.Revision, d.Document)
			if err != nil {
				break
			}
		}
	}
	if err == nil {
		for _, key := range keys {
			_, err = tx.Exec(r.Context(), "INSERT INTO content_release_assets(release_id,sha256) VALUES($1,$2)", release, key)
			if err != nil {
				break
			}
		}
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), "INSERT INTO content_channels(name,release_id) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET release_id=EXCLUDED.release_id", in.Channel, release)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && (pe.Code == "40001" || pe.Code == "40P01") {
			fail(w, 409, "publication_conflict_retry")
			return
		}
		fail(w, 500, "database_error")
		return
	}
	respond(w, 201, manifest)
}
func (a *API) channel(w http.ResponseWriter, r *http.Request) {
	var id string
	if err := a.DB.QueryRow(r.Context(), "SELECT release_id FROM content_channels WHERE name=$1", r.PathValue("channel")).Scan(&id); err != nil {
		fail(w, 404, "channel_not_found")
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	respond(w, 200, map[string]string{"releaseId": id, "manifestUrl": a.PublicURL + "/v1/releases/" + id})
}
func immutableJSON(w http.ResponseWriter, r *http.Request, b []byte) {
	etag := `"` + hash(b) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(304)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}
func (a *API) manifest(w http.ResponseWriter, r *http.Request) {
	var b []byte
	if err := a.DB.QueryRow(r.Context(), "SELECT manifest FROM content_releases WHERE id=$1", r.PathValue("release")).Scan(&b); err != nil {
		fail(w, 404, "release_not_found")
		return
	}
	immutableJSON(w, r, b)
}
func (a *API) publishedDocument(w http.ResponseWriter, r *http.Request) {
	var b []byte
	if err := a.DB.QueryRow(r.Context(), "SELECT document FROM content_release_documents WHERE release_id=$1 AND document_id=$2", r.PathValue("release"), r.PathValue("id")).Scan(&b); err != nil {
		fail(w, 404, "published_document_not_found")
		return
	}
	immutableJSON(w, r, b)
}
func (a *API) publishedAsset(w http.ResponseWriter, r *http.Request) {
	var exists bool
	if a.DB.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM content_release_assets WHERE release_id=$1 AND sha256=$2)", r.PathValue("release"), r.PathValue("sha")).Scan(&exists) != nil || !exists {
		fail(w, 404, "published_asset_not_found")
		return
	}
	a.serveAsset(w, r, r.PathValue("sha"), true)
}
func openAPI(ctx context.Context, dsn, token, publicURL string, objects Objects) (*API, error) {
	if len(token) < 32 {
		return nil, errors.New("CONTENT_API_TOKEN must contain at least 32 characters")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("invalid DATABASE_URL")
	}
	cfg.MaxConns = 6
	cfg.MinConns = 1
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("database connection failed")
	}
	if _, err = db.Exec(ctx, ddl); err != nil {
		db.Close()
		return nil, fmt.Errorf("schema initialization: %w", err)
	}
	compiler := jsonschema.NewCompiler()
	if err = compiler.AddResource("document.json", strings.NewReader(contracts.DocumentSchema)); err != nil {
		db.Close()
		return nil, err
	}
	schema, err := compiler.Compile("document.json")
	if err != nil {
		db.Close()
		return nil, err
	}
	origins := map[string]bool{}
	for _, o := range strings.Split(os.Getenv("CORS_ORIGINS"), ",") {
		if o != "" {
			origins[o] = true
		}
	}
	return &API{db, objects, token, strings.TrimRight(publicURL, "/"), schema, origins}, nil
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	objects, err := objectsFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	publicURL := os.Getenv("PUBLIC_URL")
	if !strings.HasPrefix(publicURL, "https://") {
		log.Fatal("PUBLIC_URL must be HTTPS")
	}
	a, err := openAPI(ctx, os.Getenv("DATABASE_URL"), os.Getenv("CONTENT_API_TOKEN"), publicURL, objects)
	if err != nil {
		log.Fatal(err)
	}
	defer a.DB.Close()
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":3000"
	}
	srv := &http.Server{Addr: addr, Handler: a.handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 25 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()
	log.Printf("Content API listening on %s", addr)
	if err = srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
