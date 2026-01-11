---
description: Technical code review for quality and bugs that runs pre-commit
---

# Code Review Workflow

Perform technical code review on recently changed files.

## Core Principles

- Simplicity is the ultimate sophistication - every line should justify its existence
- Code is read far more often than it's written - optimize for readability
- The best code is often the code you don't write

## What to Review

### 1. Gather Codebase Context

Read key files to understand standards:
- README.md
- Core module files
- Documented standards in docs/

### 2. Check Changed Files

// turbo
```bash
git status
git diff HEAD
git diff --stat HEAD
```

Check new files:
// turbo
```bash
git ls-files --others --exclude-standard
```

### 3. Read Each Changed File

Read each new and changed file in its entirety (not just the diff) for full context.

## Analysis Checklist

For each changed or new file, analyze for:

**1. Logic Errors**
- Off-by-one errors
- Incorrect conditionals
- Missing error handling
- Race conditions

**2. Security Issues**
- SQL injection vulnerabilities
- XSS vulnerabilities
- Insecure data handling
- Exposed secrets or API keys

**3. Performance Problems**
- N+1 queries
- Inefficient algorithms
- Memory leaks
- Unnecessary computations

**4. Code Quality**
- Violations of DRY principle
- Overly complex functions
- Poor naming
- Missing type hints/annotations

**5. Adherence to Standards**
- Documented standards
- Linting, typing, formatting
- Logging standards
- Testing standards

## Verify Issues Are Real

- Run specific tests for issues found
- Confirm type errors are legitimate
- Validate security concerns with context

## Output Format

Save to: `.agent/code-reviews/<appropriate-name>.md`

**Stats:**
- Files Modified: X
- Files Added: X
- New lines: X
- Deleted lines: X

**For each issue:**
```
severity: critical|high|medium|low
file: path/to/file.py
line: 42
issue: [one-line description]
detail: [explanation of why this is a problem]
suggestion: [how to fix it]
```

If no issues found: "Code review passed. No technical issues detected."

## Important

- Be specific (line numbers, not vague complaints)
- Focus on real bugs, not style
- Suggest fixes, don't just complain
- Flag security issues as CRITICAL
