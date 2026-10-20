# Findings

- The runner's iOS report schema is strict and binds request/generation/stage, source and recipe digests, app identity, profile metadata, and one signed IPA record.
- The runner bundles the report and report-declared files; for iOS that yields `signed.ipa` and `verification.json`.
- The unsigned source artifact contains `unsigned.xcarchive.zip` and strict five-field `source.json`; the nested ZIP has one `unsigned.xcarchive/` root and the expected app under `Products/Applications/`.
- Local inspection is read-only; CMS verification uses OpenSSL `cms -verify -noverify`, which validates the CMS signature but intentionally does not establish certificate-chain trust. Trusted-runner codesign validation remains an external assertion.
- Keep the pre-existing untracked instrumentation APK out of this task's commit.
- The verifier extracts only the IPA to a temporary directory, streams large entries, rejects unsafe/duplicate/symlink ZIP entries, validates arm64 thin Mach-O headers with `LC_BUILD_VERSION` platform iOS, and never prints a phone identifier or certificate subject.
- When `--profile` and `--phone-record` are supplied, the embedded and local CMS-signed profiles are checked for report-matching UUID, team, bundle authorization, development entitlement, future expiration, certificate identity/expiry, device count, and private phone membership.
- The tool does not recreate Apple's `codesign` verification or establish Apple trust-chain validity on Windows; it reports that those checks rely on the trusted signing runner.
