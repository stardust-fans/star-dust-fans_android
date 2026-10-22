# Task plan

- [x] Inspect project rules, existing workflow, submit helper, verifier, and GitEdge request/download contract.
- [x] Add bounded request polling, source/output archive downloads with repository/request-bound integrity checks, and verifier status assembly.
- [x] Update the iOS workflow to publish only a sanitized verification receipt; keep the signed IPA and full report in private GitEdge storage.
- [x] Update existing tests to cover request binding, terminal failure, and archive digest tampering.
- [x] Run focused Node and Python verifier tests and the repository test suite; review diff and commit the isolated branch.
- [x] Integrate current main maintenance changes and verify a fresh first-attempt production run through signed IPA verification.
