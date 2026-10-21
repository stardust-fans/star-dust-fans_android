# Central iOS signing workflow plan

- [x] Confirm the mobile worktree is clean, fast-forward it to `main`, and align the source archive and control-plane API with the signing owners.
- [x] Restrict the public workflow to building and submitting the unsigned archive.
- [x] Remove repository-key status/download/report code and tests from the public mobile helper.
- [x] Keep bounded submit handling, useful run summary, and focused root-level API contract/error tests.
- [x] Document protected administrator retrieval, update audit records, run tests, and commit only owned changes.
- [x] Confirm the dedicated Mac has completed Xcode setup and the private runner is available.
- [x] Confirm the newly approved recipe is live, then start a fresh source workflow run and obtain a successful signed IPA.
- [x] Independently verify the signed IPA signature, profile, and authorized device scope.
- [x] Reconnect and unlock the registered iPhone, install the verified IPA, and confirm installation succeeds.
- [x] Launch the app and complete startup and crash/ANR acceptance checks on the iPhone.
- [ ] Resolve the operator-reported tab-bar layout issue and obtain UI confirmation.
