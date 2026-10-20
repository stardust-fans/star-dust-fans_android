# Findings

- The Apple app bundle identifier is `top.stardustinfinity.mobile`, app version is `1.3.0`, and the generic device Release build already exists in the mobile verification workflow.
- The Xcode archive is unsigned and uses `unsigned.xcarchive/` as its nested ZIP root. The uploaded artifact ZIP contains exactly `unsigned.xcarchive.zip` and `source.json`; source metadata has only `platform`, `architecture`, `bundle_id`, `version`, and `source_sha`, with architecture `arm64`.
- Control plane: `POST /v1/requests` accepts project `stardust-ios`, platform `ios`, run id/attempt, artifact id, version, source SHA, and `execution_visibility: auto`. It uses Bearer authentication and `Idempotency-Key`. Submit returns `request_id`; status returns `request_id`, `state`, and `output`.
- The mobile workflow only builds and submits because signed development profiles can disclose registered device identifiers. An authorized administrator retrieves the IPA from the central protected interface.
- Central signing uses the fixed Xcode `-exportArchive` recipe. The workflow does not manually codesign or repackage the output IPA.
- The submit helper uses the fixed signing-service origin, rejects redirects, applies a bounded timeout, and caps JSON response bodies.
- The source archive uses `ditto --norsrc --keepParent`, which omits resource-fork metadata that would otherwise add AppleDouble entries and preserves the archive directory root.

## Current signing and device-validation status

- The fixed iOS executor uses the private GitEdge macOS broker lane (`self-hosted`, `macOS`, `ARM64`, `signing-macos-private`) with Xcode 26.6 and Homebrew Python 3.13. Native broker smoke succeeded; this proves broker dispatch, not Xcode signing readiness.
- The approved recipe is tag `ios-runner-2026-10-20-4` at commit `a1883cd3042a05c7448a9c714d49070a423cc966`; the central service deployment is `0a786f49-bb6d-44e1-9ace-57825b9a7449`.
- Signing is blocked because the Mac has not accepted the Xcode license/completed first launch. A read-only `sudo -n -l <xcodebuild> -runFirstLaunch` capability check was denied; no sudo initialization was attempted. Diagnostic run `39503920257` is not evidence that Xcode is ready.
- Source run `39503031284` at commit `55cb1466ef04901b695dcb76192797da1716fa24` created request `cf4ea9c1-88ea-4889-8ea3-03a47049ddc0`. Native runs `39503178530` and `39503479163` failed preflight before releasing signing credentials. The request references expired recipe 3; after Mac setup, verify the central service uses recipe 4 and start a new source workflow at attempt 1 rather than rerunning the old run.
- No signed IPA exists yet. The development profile covers two registered devices and the iPhone was previously registered; however, the iPhone is currently absent from USB. Reconnect and unlock it before installation. Android real-device tests already passed and do not need to be repeated.
- Earlier progress describing a completed signing implementation refers to code/control-plane delivery only. It does not mean the IPA was signed, device-installed, or accepted.
The public mobile repository must not publish the signed development IPA because its embedded provisioning profile can disclose registered device identifiers. Signed-package retrieval belongs to the central service's protected administrator interface; the repository workflow only publishes the unsigned archive and submits the request.
- GitHub Actions run `39439884602`, job `118686612149`, exposed a stale local download path: 19/20 tests passed, and the archive-positive helper test failed with `ReferenceError: writeFile is not defined`. The repository-key download operation and its tests are removed because signed-package delivery is now restricted to the central administrator interface. This retires an unauthorized delivery path rather than weakening submit assertions; signing-center output verification remains independently enforced.
