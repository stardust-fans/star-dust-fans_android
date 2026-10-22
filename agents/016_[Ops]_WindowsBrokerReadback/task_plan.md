# Task Plan
- [x] Inspect the existing Windows readback workflow and confirm its effects are limited to receipt/runtime verification and removal of the exact temporary updater tasks after both roots validate.
- [x] Fix its Git trust check to use per-command safe.directory scoped to each canonical broker root.
- [x] Replace raw receipt/error output with fixed message categories and restrict wrapper stderr output to an allowlisted category; verify exact wrapper action, task principal, and exit status before cleanup.
- [x] Add behavior tests for missing receipt, failed receipt sanitization, successful verification, and cleanup scope.
- [ ] Submit the fixed readback payload/controller for review, then dispatch the readback workflow once.
