# Progress

- Confirmed the existing Apple-client worktree was clean and `main` was an ancestor; fast-forwarded it to the requested integration commit.
- Confirmed bundle identifier/version and aligned source archive, source metadata, request body, polling, download header, and output report with signing owners and the service implementation.
- Added the default-branch-only two-operation workflow, unsigned Xcode archive envelope, authenticated Node API client, download verification, root-level tests, and README instructions.
- `node --check` passed. After the follow-up, `npm test` passed all 15 executed tests; 4 archive extraction tests were skipped on Windows because the host has no `unzip`. `git diff --check` passed. Workflow syntax was reviewed directly; no YAML parser or actionlint is installed on this host.
- Follow-up hardened workflow operation wiring (`build` maps directly to submission), pinned requests to the central HTTPS origin with redirects disabled, bounded JSON/archive streaming, validated future expiration dates and profile UUIDs, and rejected ZIP symlinks with `lstat`. Added negative tests for operation mismatch, oversized responses, invalid report metadata, archive bounds, and symlink outputs.
Removed the workflow's signed-IPA download operation and public artifact upload. The public workflow now only builds and submits an unsigned archive; authorized retrieval is documented through the central protected UI.
