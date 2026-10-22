# Progress

- Implemented bounded polling with exact request ID, profile, platform, and source digest/size checks; failed, cancelled, and awaiting_source states stop the job.
- Downloads the source GitHub artifact as its original ZIP after validating metadata and redirect host, then checks exact content length and SHA-256.
- Downloads GitEdge output only after success, checks X-Signing-Digest, exact content length, and streamed SHA-256 against request metadata. The report is bound to request ID, source digest, commit, version, stage, approved recipe/policy, team, and bundle.
- The existing verifier checks source archive, output ZIP, signed IPA, provisioning profile, certificate, and device policy. A sanitized receipt is written only after all checks pass; only that receipt is appended to the public workflow summary. The signed IPA and full report remain in private GitEdge storage.
- Production E2E run 39872901121 completed successfully on commit 87666a728e98935a66aea8055928a6ccb4b3cf45: all nine steps succeeded through GitEdge output retrieval and IPA verification. Safe receipt: request be556601-687a-4cd0-852a-8582c5371be1; source commit 87666a728e98935a66aea8055928a6ccb4b3cf45; bundle top.stardustinfinity.mobile; version 1.3.0; output SHA-256 10d8ab075ffce5faa87ffa9f7e56d0f35e36104f78ae0a71e464a1b0f742bdb7, 353307 bytes; IPA SHA-256 14d5fba68f4282c661577f40e14e4ef9ce80d79b25c0f3db5eea99b80afd7c6d, 352180 bytes; verification passed. Source ZIP SHA-256 d9262e189460e510e4666e7e95e0c1ebae8165111e56434858188b3856a008d3, 1072400 bytes.
- The previous GITEDGE_HTTP_503 did not recur; its cause is unresolved.
- Current verification: Node repository tests 18/18; Python IPA verifier tests 11/11; workflow/helper syntax and diff checks passed.
- No credentials or production configuration were changed.
- Independent D1 readback matched the same request and source digest, with native signing run completed/success and coordinator output verification.
