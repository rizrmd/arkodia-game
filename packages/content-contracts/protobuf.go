package contracts

import (
	"encoding/json"
	"fmt"

	authoringv1 "arkodia/game/packages/content-contracts/gen/go/arkadia/authoring/v1"
	contentv1 "arkodia/game/packages/content-contracts/gen/go/arkadia/content/v1"
	contentv2 "arkodia/game/packages/content-contracts/gen/go/arkadia/content/v2"
	scenev1 "arkodia/game/packages/content-contracts/gen/go/arkadia/scene/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	anypb "google.golang.org/protobuf/types/known/anypb"
)

// ResolveAny resolves a protobuf Any from a DraftSaveRequest to the concrete
// document message by its type URL.
func ResolveAny(any *anypb.Any) (proto.Message, error) {
	switch any.GetTypeUrl() {
	case "type.googleapis.com/arkadia.content.v1.EnvironmentDocument":
		return &contentv1.EnvironmentDocument{}, nil
	case "type.googleapis.com/arkadia.content.v1.AnimationDocument":
		return &contentv1.AnimationDocument{}, nil
	case "type.googleapis.com/arkadia.content.v2.LegacyDocument":
		return &contentv2.LegacyDocument{}, nil
	case "type.googleapis.com/arkadia.authoring.v1.AuthoringProject":
		return &authoringv1.AuthoringProject{}, nil
	default:
		return nil, fmt.Errorf("unsupported document type %q", any.GetTypeUrl())
	}
}

// ProtobufMediaType is the media type clients send in Accept and receive in
// Content-Type when they want the protobuf representation.
const ProtobufMediaType = "application/vnd.arkadia.protobuf"

var (
	jsonUnmarshal = protojson.UnmarshalOptions{DiscardUnknown: true}
	jsonMarshal   = protojson.MarshalOptions{EmitUnpopulated: true}
)

// MessageForJSON returns an empty protobuf message for a stored JSON document,
// chosen by its schemaVersion and kind.
func MessageForJSON(raw []byte) (proto.Message, error) {
	var head struct {
		SchemaVersion int    `json:"schemaVersion"`
		Kind          string `json:"kind"`
		Schema        string `json:"schema"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return nil, fmt.Errorf("invalid document json: %w", err)
	}
	switch head.SchemaVersion {
	case 1:
		switch head.Kind {
		case "environment", "base":
			return &contentv1.EnvironmentDocument{}, nil
		case "animation", "vfx":
			return &contentv1.AnimationDocument{}, nil
		default:
			return nil, fmt.Errorf("unsupported v1 document kind %q", head.Kind)
		}
	case 2:
		return &contentv2.LegacyDocument{}, nil
	case 3:
		return &authoringv1.AuthoringProject{}, nil
	default:
		return nil, fmt.Errorf("unsupported schemaVersion %d", head.SchemaVersion)
	}
}

// MarshalJSONToMessage parses JSON into an existing protobuf message.
func MarshalJSONToMessage(raw []byte, msg proto.Message) error {
	return jsonUnmarshal.Unmarshal(raw, msg)
}

// MarshalDocumentJSONToBytes dispatches a stored JSON document by its contract
// version and kind, then renders it as protobuf wire bytes.
func MarshalDocumentJSONToBytes(raw []byte) ([]byte, error) {
	msg, err := MessageForJSON(raw)
	if err != nil {
		return nil, err
	}
	if err := MarshalJSONToMessage(raw, msg); err != nil {
		return nil, err
	}
	return MarshalMessageToBytes(msg)
}

// MarshalMessageToJSON renders a protobuf message as canonical JSON.
func MarshalMessageToJSON(msg proto.Message) ([]byte, error) {
	return jsonMarshal.Marshal(msg)
}

// MarshalMessageToJSONCompact renders a protobuf message as JSON with only
// populated fields, matching the shape a JSON client would have sent.
func MarshalMessageToJSONCompact(msg proto.Message) ([]byte, error) {
	return protojson.MarshalOptions{}.Marshal(msg)
}

// MarshalMessageToBytes renders a protobuf message as the wire format.
func MarshalMessageToBytes(msg proto.Message) ([]byte, error) {
	return proto.Marshal(msg)
}

// UnmarshalMessageFromBytes parses the wire format into an existing message.
func UnmarshalMessageFromBytes(raw []byte, msg proto.Message) error {
	return proto.Unmarshal(raw, msg)
}

// MarshalManifestJSONToMessage parses a v1 release manifest.
func MarshalManifestJSONToMessage(raw []byte) (*contentv1.Manifest, error) {
	msg := &contentv1.Manifest{}
	if err := jsonUnmarshal.Unmarshal(raw, msg); err != nil {
		return nil, err
	}
	return msg, nil
}

// MarshalManifestMessageToBytes renders a v1 release manifest as the wire format.
func MarshalManifestMessageToBytes(msg *contentv1.Manifest) ([]byte, error) {
	return proto.Marshal(msg)
}

// UnmarshalManifestMessageFromBytes parses a v1 release manifest from the wire format.
func UnmarshalManifestMessageFromBytes(raw []byte) (*contentv1.Manifest, error) {
	msg := &contentv1.Manifest{}
	if err := proto.Unmarshal(raw, msg); err != nil {
		return nil, err
	}
	return msg, nil
}

// MarshalManifestMessageToJSON renders a v1 release manifest as canonical JSON.
func MarshalManifestMessageToJSON(msg *contentv1.Manifest) ([]byte, error) {
	return jsonMarshal.Marshal(msg)
}

// MarshalSceneJSONToMessage parses an authored scene handoff document.
func MarshalSceneJSONToMessage(raw []byte) (*scenev1.Scene, error) {
	msg := &scenev1.Scene{}
	if err := jsonUnmarshal.Unmarshal(raw, msg); err != nil {
		return nil, err
	}
	return msg, nil
}

// MarshalSceneMessageToBytes renders an authored scene as the wire format.
func MarshalSceneMessageToBytes(msg *scenev1.Scene) ([]byte, error) {
	return proto.Marshal(msg)
}

// UnmarshalSceneMessageFromBytes parses an authored scene from the wire format.
func UnmarshalSceneMessageFromBytes(raw []byte) (*scenev1.Scene, error) {
	msg := &scenev1.Scene{}
	if err := proto.Unmarshal(raw, msg); err != nil {
		return nil, err
	}
	return msg, nil
}

// MarshalSceneMessageToJSON renders an authored scene as canonical JSON.
func MarshalSceneMessageToJSON(msg *scenev1.Scene) ([]byte, error) {
	return jsonMarshal.Marshal(msg)
}
