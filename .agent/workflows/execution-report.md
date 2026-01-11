---
description: Generate implementation report for system review
---

# Execution Report Workflow

Review and analyze the implementation you just completed.

## Context

After completing implementation, reflect on:
- What you implemented
- How it aligns with the plan
- What challenges you encountered
- What diverged and why

## Generate Report

Save to: `.agent/execution-reports/<feature-name>.md`

### Meta Information
- Plan file: <path to plan>
- Files added: <list>
- Files modified: <list>
- Lines changed: +X -Y

### Validation Results
- Syntax & Linting: ✓/✗
- Type Checking: ✓/✗
- Unit Tests: ✓/✗ (X passed, Y failed)
- Integration Tests: ✓/✗

### What Went Well
<List specific things that worked smoothly>

### Challenges Encountered
<List specific difficulties and why>

### Divergences from Plan

For each divergence:

**[Divergence Title]**
- Planned: <what plan specified>
- Actual: <what was implemented>
- Reason: <why this happened>
- Type: Better approach found | Plan assumption wrong | Security concern | Performance issue | Other

### Skipped Items
<What was skipped and why>

### Recommendations

For next time:
- Plan workflow improvements
- Execute workflow improvements
- Documentation additions
