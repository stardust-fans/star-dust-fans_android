# Apple signing and device-build validation plan
- [x] Inspect the existing iOS project/workflow and record the unsigned device build shape.
- [x] Perform bounded, read-only discovery for existing Apple signing identities and tools without reading private material.
- [x] Add a macOS CI job that builds and uploads an unsigned generic iOS-device app artifact.
- [x] Validate the workflow structure and repository diff; record remaining prerequisites for a signed IPA.
- [x] Commit only the workflow and this task audit directory.
