# Findings

- GitEdge request polling returns a flat public request object under data; submit returns data.request. The status response includes source and output digest/size but no report or source commit/version fields.
- GitEdge output download returns a raw ZIP with X-Signing-Digest and Content-Length. The ZIP contains signed.ipa and verification.json; the existing verifier needs a central-status-shaped record, assembled from the verified request, source metadata, archive bytes, and embedded report.
- The original GitHub artifact ZIP is necessary input to the existing verifier because its declared artifact digest covers the outer ZIP. Repacking extracted content would change the digest and violate that contract.
- The production approved iOS profile values are recipe SHA 70a52dfbe00bae1136f68186d4ad035f74f3cb1d, policy digest sha256:518ffa7c0b89f7f717d47f58853400293744b3e678b520a6292812ab3292a846, and team ID 76DMUAK6J5; all are pinned and checked against the signing report.
- The output download URL appends /download to URL.pathname so repositoryId remains a query parameter. Tests assert the exact pathname and repositoryId.
- The report input digest is bound to the streamed source ZIP digest and GitEdge request source digest, and report request ID, stage, source SHA, version, recipe SHA, policy digest, team, and bundle are checked.
- Since the repository is public, the signed IPA, full report, and status are not uploaded to GitHub artifacts or emitted in logs. The workflow verifies them in temporary storage and publishes only a sanitized Actions summary with request ID, source SHA, bundle/version, hashes, sizes, and pass status.
- The GitHub source-artifact 302 response body is cancelled before following the validated Azure blob URL.
- No production credentials were used, and no workflow was dispatched from this worktree.