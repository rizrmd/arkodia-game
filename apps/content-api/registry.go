package main

import (
	contracts "arkodia/game/packages/content-contracts"
	"encoding/json"
	"net/http"
)

func (a *API) contractRegistry(w http.ResponseWriter, r *http.Request) {
	var schema map[string]any
	json.Unmarshal([]byte(contracts.DocumentSchema), &schema)
	versions := schema["oneOf"].([]any)
	v2 := versions[1].(map[string]any)
	formats := v2["properties"].(map[string]any)["data"].(map[string]any)["properties"].(map[string]any)["format"].(map[string]any)["enum"]
	respond(w, 200, map[string]any{"schemaVersions": []int{1, 2}, "formats": formats, "compatibility": "explicit opt-in; no automatic runtime loading or schema conversion", "schemaSha256": hash([]byte(contracts.DocumentSchema))})
}
func (a *API) versionedSchema(w http.ResponseWriter, r *http.Request) {
	version := r.PathValue("version")
	i := 0
	if version == "v2" {
		i = 1
	} else if version != "v1" {
		fail(w, 404, "unsupported_schema_version")
		return
	}
	var schema map[string]any
	json.Unmarshal([]byte(contracts.DocumentSchema), &schema)
	out := schema["oneOf"].([]any)[i].(map[string]any)
	out["$schema"] = "http://json-schema.org/draft-07/schema#"
	out["$id"] = a.PublicURL + "/contracts/" + version + "/document.schema.json"
	respond(w, 200, out)
}
