---
name: dsh-baton
description: Delegate work to DeepSeek Harness when the user asks to hand a task to DSH, DeepSeek Harness, or dsh-baton. Use the MCP tools to send the task, wait efficiently, and receive its deliverable. Apply this workflow only to the delegated scope.
---

# Delegate to DeepSeek Harness

Send a self-contained task with `dsh_send`: include the user's requirements, working folder, permitted changes, deliverable, and completion criteria. Harness does not see this conversation. Preserve the user's model choice and permission boundaries. For code changes, include the project's relevant checks when known; document and read-only tasks need no invented test commands.

After sending, let Harness perform the delegated work independently. Call `dsh_wait` and keep that call pending using the script-cell yield specified by the tool. Each wait lasts at most 15 minutes and returns early when Harness completes or needs user input. If 15 minutes pass without completion, use the returned status and call `dsh_wait` again with the same run ID (or session ID and returned cursor when following a session). Avoid extra status calls, short shell waits, CLI polling, and model wake-ups between these waits.

While waiting, do not query status, read the session or logs, reread task materials, duplicate the analysis, or generate routine progress reports. Work alongside Harness only when the user explicitly requests parallel work. If the user changes the task, steer the new requirement into the same session and wait on the returned run ID. Surface a genuine request for user input or an external blocker when it arrives; delegation does not authorize new approvals.

On completion, use the returned deliverable, source pointers, review table, and plugin-produced evidence. Accept a complete, consistent result by default. Check a specific file or send one consolidated correction only when a requirement is missing, evidence conflicts, or a check failed. For a report or read-only task, an identifiable deliverable and its source pointers can satisfy completion without a test command or review sub-agent.

Report the result concisely and link the deliverable. Keep unrelated user requests outside this delegation workflow.
