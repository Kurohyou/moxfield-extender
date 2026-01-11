---
description: Analyze implementation against plan for process improvements
---

# System Review Workflow

Perform meta-level analysis of how well implementation followed the plan.

**System review is NOT code review.** You're not looking for bugs - you're looking for bugs in the process.

## Purpose

- Analyze plan adherence and divergence patterns
- Identify which divergences were justified vs problematic
- Surface process improvements
- Suggest updates to documentation and workflows

## Philosophy

- Good divergence reveals plan limitations → improve planning
- Bad divergence reveals unclear requirements → improve communication
- Repeated issues reveal missing automation → create workflows

## Inputs

1. **Plan file**: The implementation plan that was followed
2. **Execution report**: What actually happened during implementation

## Analysis Workflow

### Step 1: Understand the Planned Approach
- What features were planned?
- What architecture was specified?
- What validation steps were defined?

### Step 2: Understand the Actual Implementation
- What was implemented?
- What diverged from the plan?
- What was skipped and why?

### Step 3: Classify Each Divergence

**Good Divergence ✅** (Justified):
- Plan assumed something that didn't exist
- Better pattern discovered
- Performance optimization needed
- Security issue discovered

**Bad Divergence ❌** (Problematic):
- Ignored explicit constraints
- Created new architecture instead of following patterns
- Took shortcuts that introduce tech debt
- Misunderstood requirements

### Step 4: Trace Root Causes
- Was the plan unclear?
- Was context missing?
- Was validation missing?

### Step 5: Generate Process Improvements
- Documentation updates
- Plan workflow updates
- New workflows to create
- Validation additions

## Output Format

Save to: `.agent/system-reviews/<feature-name>-review.md`

### Meta Information
- Plan reviewed: <path>
- Execution report: <path>
- Date: <date>

### Overall Alignment Score: __/10

- 10: Perfect adherence
- 7-9: Minor justified divergences
- 4-6: Mix of justified and problematic
- 1-3: Major problematic divergences

### Divergence Analysis

```yaml
divergence: <what changed>
planned: <what plan specified>
actual: <what was implemented>
classification: good ✅ | bad ❌
justified: yes/no
root_cause: <unclear plan | missing context | etc>
```

### Pattern Compliance
- [ ] Followed codebase architecture
- [ ] Used documented patterns
- [ ] Applied testing patterns correctly
- [ ] Met validation requirements

### System Improvement Actions

**Update Documentation:**
- [ ] Document <pattern X> discovered
- [ ] Add anti-pattern warning for <Y>

**Update Plan Workflow:**
- [ ] Add instruction for <missing step>
- [ ] Clarify <ambiguous instruction>

**Create New Workflow:**
- [ ] `/<workflow-name>` for <repeated manual process>

### Key Learnings
- What worked well
- What needs improvement
- Concrete improvements for next time

## Important

- **Be specific** - don't say "plan was unclear", say "plan didn't specify which pattern to use"
- **Focus on patterns** - one-off issues aren't actionable
- **Action-oriented** - every finding should have a concrete update suggestion
