# Findings

- Current signing workflow is `ios-sign.yml`; its unsigned source artifact is `unsigned-ios-archive`.
- GitEdge policy mapping is repository `stardust-fans/star-dust-fans_android` (repository ID `1423880436`), workflow `.github/workflows/ios-sign.yml`, profile `stardust-ios`, and pull-based source artifact.
- GitHub run and artifact metadata are checked before submission. The request carries the artifact ID, digest, size, run ID, commit, profile, and version; the GitHub Actions OIDC token is sent as the run identity.
- The existing administrator IPA retrieval and standalone signed IPA verifier remain the operator path.
- No remote workflow dispatch or production request was made.
