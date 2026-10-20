# Central iOS signing workflow plan

- [x] Confirm the mobile worktree is clean, fast-forward it to `main`, and align the source archive and control-plane API with the signing owners.
- [x] Restrict the public workflow to building and submitting the unsigned archive.
- [x] Remove repository-key status/download/report code and tests from the public mobile helper.
- [x] Keep bounded submit handling, useful run summary, and focused root-level API contract/error tests.
- [x] Document protected administrator retrieval, update audit records, run tests, and commit only owned changes.
- [ ] Wait for the dedicated Mac to complete Xcode first-launch/license setup, then confirm the approved executor recipe is active.
- [ ] Start a fresh source workflow run (attempt 1) and obtain a successful signed IPA; do not retry the expired recipe-3 request.
- [ ] Independently verify the signed IPA signature, profile, and authorized device scope.
- [ ] Reconnect and unlock the registered iPhone, install the verified IPA, and confirm installation succeeds.
- [ ] Launch the app and complete startup and crash/ANR acceptance checks on the iPhone.
