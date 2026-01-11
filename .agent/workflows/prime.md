---
description: Prime agent with comprehensive codebase understanding
---

# Prime Workflow

Build comprehensive understanding of the codebase by analyzing structure, documentation, and key files.

## Process

### 1. Analyze Project Structure

// turbo
```bash
git ls-files
```

Show directory structure:
```bash
find . -type d -name node_modules -prune -o -type d -name __pycache__ -prune -o -type d -name .git -prune -o -type d -name dist -prune -o -type d -name build -prune -o -print | head -100
```

### 2. Read Core Documentation

- Read README.md or similar global rules file
- Read architecture documentation if available
- Check for project conventions in docs/

### 3. Identify Key Files

Based on the structure, identify and read:
- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 4. Understand Current State

// turbo
```bash
git log -10 --oneline
```

// turbo
```bash
git status
```

## Output Report

Provide a concise summary covering:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles
- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State
- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

**Make this summary easy to scan - use bullet points and clear headers.**
