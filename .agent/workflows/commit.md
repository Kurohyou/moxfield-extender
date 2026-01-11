---
description: Create a git commit for all uncommitted changes
---

# Commit Workflow

Create a new commit for all uncommitted changes.

## Steps

1. Review current state:
```bash
git status && git diff HEAD && git status --porcelain
```

2. Add untracked and changed files:
```bash
git add -A
```

3. Create an atomic commit with an appropriate message using conventional commit format:
   - Use tags: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   - Format: `<tag>(<scope>): <description>`

4. Commit the changes:
```bash
git commit -m "<tag>(<scope>): <description>"
```
