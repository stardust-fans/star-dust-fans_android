# Task Plan
- [x] Verify the exact Android repository origin and current main revision; create an isolated worktree.
- [x] Copy the fixed maintenance workflow and contract test; verify payload hashes against reviewed sources.
- [x] Record delivery misroute and production-risk findings; run local validation.
- [x] Deliver the reviewed fixed controller to unprotected Android main and verify the macOS and initial Windows workflow runs.
- [x] Deliver and run the reviewed Windows-only diagnostic refinement; record the actual `dubious ownership` result from D1.
- [x] Read the second Windows diagnosis: both broker roots are clean at the expected ancestry, helper tasks are Ready with the known failed result, and helper principal SIDs match the running broker tasks.
- [x] Prepare a fixed Windows stage workflow that verifies both inactive helper tasks' exact Node action, helper path, arguments, principal SID, and task state before any write; it refreshes only those helper tasks and starts independent wrappers with bounded logs.
- [ ] Obtain review of the stage workflow and behavior tests before dispatch; the script has not been uploaded or run on a host.
