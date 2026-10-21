# Verify source archive parent entries

## Validation status update (2026-10-21)

- [x] Confirm a fresh source workflow successfully built and submitted the archive; all CI jobs including iOS archive and Apple checks passed.
- [x] Confirm independent signed output validation succeeded for the resulting request.

- [x] Confirm the existing branch is clean except pre-existing untracked artifacts; fast-forward from main and create an isolated task branch.
- [x] Inspect source archive and IPA directory validation for explicit parent-directory handling.
- [x] Permit only the two expected source archive parent directory entries and add positive/negative regression tests.
- [x] Run focused tests and static checks, inspect the final diff, and commit the task files locally.
