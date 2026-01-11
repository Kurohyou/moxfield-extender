---
description: Analyze and document root cause for a GitHub issue
---

# RCA Workflow

Investigate a GitHub issue, identify the root cause, and document findings.

**Prerequisites:**
- Working in a local Git repository with GitHub origin
- GitHub CLI installed and authenticated (`gh auth status`)
- Valid GitHub issue ID

## Investigation Process

### 1. Fetch GitHub Issue Details

```bash
gh issue view <issue-id>
```

### 2. Search Codebase

- Search for components mentioned in issue
- Find related functions, classes, or modules
- Look for patterns or recent changes
- Search for error messages from the issue

### 3. Review Recent History

```bash
git log --oneline -20 -- <relevant-paths>
```

Look for:
- Recent modifications to affected code
- Related bug fixes
- Refactorings that might have introduced the issue

### 4. Investigate Root Cause

- What is the actual bug?
- Why is it happening?
- What was the original intent?
- Is this a logic error, edge case, or missing validation?

### 5. Assess Impact

- How widespread is this issue?
- What features are affected?
- Are there workarounds?
- Could this cause data corruption or security issues?

### 6. Propose Fix Approach

- What needs to be changed?
- Which files will be modified?
- What testing is needed?
- Are there risks or side effects?

## Output: Create RCA Document

Save analysis as: `docs/rca/issue-<issue-id>.md`

```markdown
# Root Cause Analysis: GitHub Issue #<id>

## Issue Summary
- **GitHub Issue ID**: #<id>
- **Title**: <Issue title>
- **Severity**: Critical/High/Medium/Low

## Problem Description
<Clear description>

**Expected Behavior:** <What should happen>
**Actual Behavior:** <What actually happens>

## Reproduction
1. Step 1
2. Step 2
3. Observe issue

## Root Cause

### Affected Components
- **Files**: <List>
- **Functions/Classes**: <Locations>

### Analysis
<Detailed explanation>

**Code Location:**
<File path:line number with relevant snippet>

## Impact Assessment
- Scope: <How widespread>
- Affected Features: <List>
- Severity Justification: <Why this level>

## Proposed Fix

### Fix Strategy
<High-level approach>

### Files to Modify
1. **<file-path>**
   - Changes: <What>
   - Reason: <Why>

### Testing Requirements
1. Test case to verify fix
2. Regression test
3. Edge case tests

### Validation Commands
```bash
<commands to verify fix>
```

## Next Steps
1. Review this RCA
2. Run: `/implement-fix` to implement
3. Run: `/commit` after completion
```
