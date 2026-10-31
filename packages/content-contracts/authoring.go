package contracts

import (
	"encoding/json"
	"errors"
	"reflect"
	"regexp"
	"sort"
)

var AuthoringDomains = []string{"objects", "environments", "bases", "characters", "animations", "audio", "vfx", "catalog"}
var authoringID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var authoringSHA = regexp.MustCompile(`^[a-f0-9]{64}$`)

type AuthoringReference struct {
	Domain string `json:"domain"`
	ID     string `json:"id"`
}
type AuthoringEntity struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Data       map[string]any       `json:"data"`
	Assets     []string             `json:"assets"`
	References []AuthoringReference `json:"references"`
}
type AuthoringData struct {
	OrganizationID string                                `json:"organizationId"`
	ProjectID      string                                `json:"projectId"`
	Domains        map[string]map[string]AuthoringEntity `json:"domains"`
}
type AuthoringDocument struct {
	SchemaVersion int           `json:"schemaVersion"`
	Kind          string        `json:"kind"`
	Name          string        `json:"name"`
	Assets        []string      `json:"assets"`
	Data          AuthoringData `json:"data"`
}
type AuthoringOperation struct {
	Kind   string           `json:"kind"`
	Domain string           `json:"domain"`
	ID     string           `json:"id"`
	Label  string           `json:"label"`
	Entity *AuthoringEntity `json:"entity,omitempty"`
}

func AuthoringDomain(s string) bool {
	for _, d := range AuthoringDomains {
		if d == s {
			return true
		}
	}
	return false
}

// Reject prototype keys in every language, and bound nesting before recursive consumers.
func safeAuthoringJSON(v any, depth int) bool {
	if depth > 64 {
		return false
	}
	switch x := v.(type) {
	case map[string]any:
		for k, child := range x {
			if k == "__proto__" || k == "prototype" || k == "constructor" || !safeAuthoringJSON(child, depth+1) {
				return false
			}
		}
	case []any:
		for _, child := range x {
			if !safeAuthoringJSON(child, depth+1) {
				return false
			}
		}
	}
	return true
}
func ValidateAuthoring(value map[string]any) error {
	if value["schemaVersion"] != float64(3) {
		return nil
	}
	if !safeAuthoringJSON(value, 0) {
		return errors.New("unsafe_authoring_data")
	}
	b, _ := json.Marshal(value)
	var d AuthoringDocument
	if json.Unmarshal(b, &d) != nil || d.Kind != "authoring-project" || !authoringID.MatchString(d.Data.OrganizationID) || !authoringID.MatchString(d.Data.ProjectID) || len(d.Data.Domains) != len(AuthoringDomains) {
		return errors.New("invalid_authoring_project")
	}
	assets := map[string]bool{}
	for _, domain := range AuthoringDomains {
		entities, exists := d.Data.Domains[domain]
		if !exists || entities == nil {
			return errors.New("invalid_authoring_domain")
		}
		for id, e := range entities {
			if id != e.ID || !authoringID.MatchString(id) || e.Name == "" || len(e.Name) > 800 || e.Data == nil || e.Assets == nil || e.References == nil {
				return errors.New("invalid_authoring_entity")
			}
			if nativeID, ok := e.Data["id"]; ok && nativeID != id {
				return errors.New("authoring_entity_identity_mismatch")
			}
			for _, sha := range e.Assets {
				if !authoringSHA.MatchString(sha) {
					return errors.New("invalid_authoring_asset")
				}
				assets[sha] = true
			}
			for _, ref := range e.References {
				if !AuthoringDomain(ref.Domain) || d.Data.Domains[ref.Domain][ref.ID].ID != ref.ID {
					return errors.New("authoring_reference_missing")
				}
			}
		}
	}
	if len(assets) != len(d.Assets) {
		return errors.New("authoring_asset_manifest_mismatch")
	}
	for _, sha := range d.Assets {
		if !assets[sha] {
			return errors.New("authoring_asset_manifest_mismatch")
		}
	}
	return nil
}
func RefreshAuthoringAssets(d *AuthoringDocument) {
	set := map[string]bool{}
	for _, entities := range d.Data.Domains {
		for _, e := range entities {
			for _, sha := range e.Assets {
				set[sha] = true
			}
		}
	}
	d.Assets = []string{}
	for sha := range set {
		d.Assets = append(d.Assets, sha)
	}
	sort.Strings(d.Assets)
}

// Apply one meaningful entity change. Final graph validation occurs after the whole batch.
func ApplyAuthoringOperation(d *AuthoringDocument, op AuthoringOperation) (AuthoringOperation, error) {
	bad := errors.New("invalid_authoring_operation")
	if !AuthoringDomain(op.Domain) || !authoringID.MatchString(op.ID) || op.Label == "" || len(op.Label) > 800 {
		return AuthoringOperation{}, bad
	}
	entities := d.Data.Domains[op.Domain]
	if entities == nil {
		return AuthoringOperation{}, bad
	}
	old, exists := entities[op.ID]
	inverse := AuthoringOperation{Kind: "entity.remove", Domain: op.Domain, ID: op.ID, Label: op.Label}
	if exists {
		inverse.Kind = "entity.put"
		inverse.Entity = &old
	}
	switch op.Kind {
	case "entity.put":
		if op.Entity == nil || op.Entity.ID != op.ID || reflect.DeepEqual(old, *op.Entity) {
			return AuthoringOperation{}, bad
		}
		entities[op.ID] = *op.Entity
	case "entity.remove":
		if !exists || op.Entity != nil {
			return AuthoringOperation{}, bad
		}
		delete(entities, op.ID)
	default:
		return AuthoringOperation{}, bad
	}
	RefreshAuthoringAssets(d)
	return inverse, nil
}
