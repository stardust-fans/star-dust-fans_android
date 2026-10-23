# 013 GitEdge iOS signing migration

## Objective
Replace the repository's legacy iOS signing request API with the existing GitEdge native source-artifact request contract while preserving administrator retrieval and local IPA verification.

## Plan
- [x] Inspect current workflow, policy mapping, and verification contract.
- [x] Submit the unsigned GitHub artifact by ID and bind the request to workflow run, commit, digest, size, profile, and GitHub OIDC identity.
- [x] Remove legacy signing API configuration from the workflow.
- [x] Update contract tests and run focused checks.
- [x] Commit local changes; subsequent authorized production delivery and full iOS verification completed.

## Scope
No production dispatch, credential provisioning, signed IPA retrieval, or release automation is performed here.
