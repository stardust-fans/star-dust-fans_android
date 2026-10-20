# Central iOS signing workflow plan

- [x] Confirm current mobile worktree is clean, fast-forward it to `main`, and align the source archive and control-plane API with the signing owners.
- [x] Write a workflow with separate build and download dispatch operations, restricted to the default branch.
- [x] Add a small Node helper for authenticated submit/status/download operations, archive digest checks, and verification report validation without logging credentials.
- [x] Add meaningful root-level tests for request contract, API errors, archive integrity, and report mismatches.
- [x] Document how to build, submit, and retrieve the signed IPA; update audit records.
- [x] Run repository tests, review workflow syntax on the host, and commit only owned changes.
