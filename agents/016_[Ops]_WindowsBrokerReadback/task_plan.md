# Task Plan
- [x] Inspect the existing Windows readback workflow and confirm its effects are limited to receipt/runtime verification and removal of the exact temporary updater tasks after both roots validate.
- [x] Fix its Git trust check to use per-command safe.directory scoped to each canonical broker root.
- [x] Replace raw receipt/error output with fixed message categories and restrict wrapper stderr output to an allowlisted category; verify exact wrapper action, task principal, and exit status before cleanup.
- [x] Add behavior tests for missing receipt, failed receipt sanitization, successful verification, and cleanup scope.
- [x] Submit the fixed readback payload/controller for review, then dispatch the readback workflow once.
- [x] Record the readback failure without cleaning up either updater task or changing broker state.
- [x] Prepare a fixed, read-only two-root diagnostics workflow covering receipt, checkout, task action/state, process counts, and service log categories.
- [x] Submit the diagnostics payload/controller and run it once to establish the second Windows broker's actual state.
- [ ] Read-only inspect both fixed launcher scripts and compare broker process start times with update receipts; retrieve only fixed runtime/log flags before proposing recovery.
