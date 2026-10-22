# Progress

- Added bounded polling with exact request ID, profile, platform, source digest/size checks; failed/cancelled/awaiting_source states stop the job.
- Downloaded the source GitHub artifact as the original ZIP from its API redirect after validating the metadata. Enforced HTTPS and the GitHub Actions result blob hostname, then checked exact content length and SHA-256.
- Downloaded GitEdge output only after success, checked `X-Signing-Digest`, exact content length, and streamed SHA-256 against request output metadata. Bound the embedded verification report to request ID, source commit, version, approved recipe SHA, Apple team ID, and bundle ID.
- Generated the status record consumed by the repository verifier. Updated the verifier to copy `signed.ipa` only after all existing archive/signature/profile/device checks pass. Workflow now uploads the verified IPA, verification report, and status record as a short-retention artifact.
- Focused checks passed: `node --check .github/scripts/ios-sign-api.mjs`; `node --test test/ios-sign-api.test.mjs` (7/7); `python test/verify_signed_ipa_test.py` (11/11); `npm test` (15/15).
- A first focused run exposed an outdated assertion for the extra digest/size GitHub outputs; updated it to assert the final output contract and reran all checks successfully.
- No GitHub Actions workflow was dispatched and no credentials were changed.
