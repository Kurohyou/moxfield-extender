---
description: Implement fix from RCA document for GitHub issue
---

# Implement Fix Workflow

Implement fixes for GitHub issues based on RCA documents.

**Prerequisites:**
- RCA document exists at `docs/rca/issue-<issue-id>.md`
- GitHub CLI installed (optional, for status updates)

## Implementation Instructions

### 1. Read and Understand RCA

- Read the ENTIRE RCA document
- Review the GitHub issue details
- Understand the root cause
- Review the proposed fix strategy
- Note all files to modify
- Review testing requirements

### 2. Verify Current State

Before making changes:
- Confirm the issue still exists
- Check current state of affected files
- Review any recent changes

### 3. Implement the Fix

For each file to modify:

#### a. Read the existing file
- Understand current implementation
- Locate the specific code mentioned in RCA

#### b. Make the fix
- Implement the change as described
- Maintain code style and conventions
- Add comments if the fix is non-obvious

#### c. Handle related changes
- Update any related code affected
- Ensure consistency across codebase
- Update imports if needed

### 4. Add/Update Tests

Create test cases for:
1. Verify the fix resolves the issue
2. Test edge cases related to the bug
3. Ensure no regression in related functionality

```python
def test_issue_<id>_fix():
    """Test that issue #<id> is fixed."""
    # Arrange - set up the scenario
    # Act - execute the code
    # Assert - verify it works
```

### 5. Run Validation

Execute validation commands from RCA:
- Run linters
- Run type checking
- Run tests

If validation fails, fix issues and re-run.

### 6. Verify Fix

- Follow reproduction steps from RCA
- Confirm issue no longer occurs
- Test edge cases
- Check for unintended side effects

## Output Report

### Fix Implementation Summary
- **GitHub Issue**: #<id>
- **Root Cause**: <one-line summary>

### Changes Made
- Files Modified: <list with paths and changes>

### Tests Added
- Test files and test functions added

### Validation Results
```bash
# Linter, type check, test output
```

### Verification
- ✅ Followed reproduction steps - issue resolved
- ✅ Tested edge cases - all pass
- ✅ No new issues introduced

### Ready for Commit

**Suggested commit message:**
```
fix(<scope>): resolve GitHub issue #<id> - <description>

<Summary of what was fixed>

Fixes #<id>
```

### Optional: Update GitHub Issue

```bash
gh issue comment <id> --body "Fix implemented in commit [hash]. Ready for review."
gh issue close <id> --comment "Fixed and merged."
```
