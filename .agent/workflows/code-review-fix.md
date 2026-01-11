---
description: Process to fix bugs found in manual/AI code review
---

# Code Review Fix Workflow

Fix issues found in a code review.

## Input

- Code review file or description of issues

## Process

If the code-review is a file, read the entire file first to understand all issues.

For each fix:

1. **Explain what was wrong**
2. **Show the fix**
3. **Create and run relevant tests to verify**

## After All Fixes

Run the `/validate` workflow to finalize your fixes and ensure everything passes.
