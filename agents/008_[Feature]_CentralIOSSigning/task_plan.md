# Central iOS signing workflow plan

- [x] Confirm the mobile worktree is clean, fast-forward it to `main`, and align the source archive and control-plane API with the signing owners.
- [x] Restrict the public workflow to building and submitting the unsigned archive.
- [x] Remove repository-key status/download/report code and tests from the public mobile helper.
- [x] Keep bounded submit handling, useful run summary, and focused root-level API contract/error tests.
- [x] Document protected administrator retrieval, update audit records, run tests, and commit only owned changes.
