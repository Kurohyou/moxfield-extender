---
description: Generate a Product Requirements Document from conversation context
---

# PRD Workflow

Generate a comprehensive Product Requirements Document (PRD) based on conversation context and requirements.

## Output File

Write the PRD to the specified filename (default: `PRD.md`)

## PRD Structure

Create a well-structured PRD with these sections:

### Required Sections

**1. Executive Summary**
- Concise product overview (2-3 paragraphs)
- Core value proposition
- MVP goal statement

**2. Mission**
- Product mission statement
- Core principles (3-5 key principles)

**3. Target Users**
- Primary user personas
- Technical comfort level
- Key user needs and pain points

**4. MVP Scope**
- **In Scope:** Core functionality for MVP (use ✅ checkboxes)
- **Out of Scope:** Features deferred to future phases (use ❌ checkboxes)

**5. User Stories**
- Primary user stories (5-8 stories) in format: "As a [user], I want to [action], so that [benefit]"
- Include concrete examples

**6. Core Architecture & Patterns**
- High-level architecture approach
- Directory structure
- Key design patterns

**7. Tools/Features**
- Detailed feature specifications
- Core feature breakdown

**8. Technology Stack**
- Backend/Frontend technologies with versions
- Dependencies and libraries
- Third-party integrations

**9. Security & Configuration**
- Authentication/authorization approach
- Configuration management
- Deployment considerations

**10. API Specification** (if applicable)
- Endpoint definitions
- Request/response formats
- Example payloads

**11. Success Criteria**
- MVP success definition
- Functional requirements (use ✅ checkboxes)

**12. Implementation Phases**
- Break down into 3-4 phases
- Each phase: Goal, Deliverables, Validation criteria

**13. Future Considerations**
- Post-MVP enhancements
- Integration opportunities

**14. Risks & Mitigations**
- 3-5 key risks with mitigation strategies

**15. Appendix** (if applicable)
- Related documents
- Key dependencies

## Instructions

1. **Extract Requirements** - Review conversation history, identify explicit/implicit needs
2. **Synthesize Information** - Organize into sections, fill reasonable assumptions
3. **Write the PRD** - Use clear language, include examples, use markdown formatting
4. **Quality Checks:**
   - ✅ All required sections present
   - ✅ User stories have clear benefits
   - ✅ MVP scope is realistic
   - ✅ Technology choices are justified
   - ✅ Implementation phases are actionable

## After Creating

1. Confirm where the PRD was written
2. Provide brief summary
3. Highlight assumptions made
4. Suggest next steps
