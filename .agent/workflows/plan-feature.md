---
description: Create comprehensive feature plan with deep codebase analysis
---

# Plan Feature Workflow

Transform a feature request into a comprehensive implementation plan through systematic codebase analysis, external research, and strategic planning.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a context-rich implementation plan that enables one-pass implementation success.

**Key Philosophy**: Context is King. The plan must contain ALL information needed for implementation.

## Planning Process

### Phase 1: Feature Understanding

**Deep Feature Analysis:**
- Extract the core problem being solved
- Identify user value and business impact
- Determine feature type: New Capability/Enhancement/Refactor/Bug Fix
- Assess complexity: Low/Medium/High
- Map affected systems and components

**Create User Story:**
```
As a <type of user>
I want to <action/goal>
So that <benefit/value>
```

### Phase 2: Codebase Intelligence Gathering

**1. Project Structure Analysis**
- Detect primary language(s), frameworks, and runtime versions
- Map directory structure and architectural patterns
- Identify service/component boundaries
- Locate configuration files

**2. Pattern Recognition**
- Search for similar implementations in codebase
- Identify coding conventions (naming, file organization, error handling)
- Document anti-patterns to avoid

**3. Dependency Analysis**
- Catalog external libraries relevant to feature
- Find relevant documentation
- Note library versions and compatibility

**4. Testing Patterns**
- Identify test framework and structure
- Find similar test examples for reference

**5. Integration Points**
- Identify existing files that need updates
- Determine new files that need creation
- Map router/API registration patterns

### Phase 3: External Research & Documentation

- Research latest library versions and best practices
- Find official documentation with specific section anchors
- Locate implementation examples
- Identify common gotchas

### Phase 4: Deep Strategic Thinking

- How does this feature fit into existing architecture?
- What are the critical dependencies?
- What could go wrong? (Edge cases, race conditions)
- How will this be tested?
- Performance implications?
- Security considerations?

## Output Plan Structure

Save to: `.agent/plans/{kebab-case-feature-name}.md`

```markdown
# Feature: <feature-name>

## Feature Description
<Detailed description>

## User Story
As a <user>, I want to <action>, so that <benefit>

## Context References

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)
- `path/to/file.py` (lines X-Y) - Why: Contains pattern to mirror

### New Files to Create
- `path/to/new_file.py` - Purpose

### Relevant Documentation
- [Doc Link](url) - Why needed

### Patterns to Follow
<Specific patterns from codebase>

## Implementation Plan

### Phase 1: Foundation
<Tasks>

### Phase 2: Core Implementation
<Tasks>

### Phase 3: Integration
<Tasks>

### Phase 4: Testing & Validation
<Tasks>

## Step-by-Step Tasks

### {ACTION} {target_file}
- **IMPLEMENT**: {Specific detail}
- **PATTERN**: {Reference to existing pattern}
- **VALIDATE**: `{command}`

## Testing Strategy
<Unit tests, integration tests, edge cases>

## Validation Commands
<Lint, type check, test commands>

## Acceptance Criteria
- [ ] Feature implements all functionality
- [ ] All validation commands pass
- [ ] Tests cover requirements
- [ ] No regressions
```

## Quality Criteria

- [ ] All necessary patterns identified
- [ ] Tasks ordered by dependency
- [ ] Each task is atomic and independently testable
- [ ] Validation commands are executable
- [ ] Another developer could execute without additional context
