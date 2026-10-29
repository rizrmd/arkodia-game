package main

import (
	"encoding/binary"
	"testing"
)

func TestGLBIntegrityValidation(t *testing.T) {
	json := []byte(`{"asset":{"version":"2.0"},"buffers":[{"byteLength":4}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":4}]}`)
	for len(json)%4 != 0 {
		json = append(json, ' ')
	}
	b := make([]byte, 20+len(json)+12)
	copy(b, "glTF")
	binary.LittleEndian.PutUint32(b[4:], 2)
	binary.LittleEndian.PutUint32(b[8:], uint32(len(b)))
	binary.LittleEndian.PutUint32(b[12:], uint32(len(json)))
	copy(b[16:], "JSON")
	copy(b[20:], json)
	offset := 20 + len(json)
	binary.LittleEndian.PutUint32(b[offset:], 4)
	copy(b[offset+4:], "BIN\x00")
	if _, e := glbJSON(b); e != nil {
		t.Fatal(e)
	}
	if _, e := glbJSON(b[:len(b)-1]); e == nil {
		t.Fatal("truncated GLB accepted")
	}
	b[offset] = 99
	if _, e := glbJSON(b); e == nil {
		t.Fatal("invalid binary chunk accepted")
	}
}
