# Findings

- GitEdge request polling returns a flat public request object under `data`; submit returns `data.request`. The status response includes source and output digest/size but no report or source commit/version fields.
- GitEdge output download returns a raw ZIP with `X-Signing-Digest` and `Content-Length`. The ZIP contains `signed.ipa` and `verification.json`; the existing verifier requires a central-status-shaped record, so the workflow constructs one from the verified request, source metadata, archive bytes, and embedded report.
- The original GitHub artifact ZIP is necessary input to the existing verifier because its declared artifact digest covers the outer ZIP. Repacking extracted content would change the digest and violate that contract.
- The production approved iOS profile values provided by the project owner are recipe SHA `70a52dfbe00bae1136f68186d4ad035f74f3cb1d` and team ID `76DMUAK6J5`; both are pinned in the caller and rechecked by the verifier.
- The first test run failed only because the old assertion expected the submit step to emit request ID alone. The final test checks request ID plus source digest and size.
- No integration with production credentials or a live Actions run was performed from this worktree.
