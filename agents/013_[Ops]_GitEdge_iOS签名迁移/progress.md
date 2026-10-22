# Progress

- 2026-10-22: Replaced the legacy API-key signing request with GitEdge's native source-artifact request.
- 2026-10-22: Added tests for GitHub run/artifact binding, OIDC audience and identity, request payload, and mismatched service responses.
- 2026-10-22: `node --test test/ios-sign-api.test.mjs` passed (5 tests); `node --check .github/scripts/ios-sign-api.mjs` and `git diff --check` passed.
- 2026-10-22: No production dispatch performed; local commit remains.
