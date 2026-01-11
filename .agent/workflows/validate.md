---
description: Run comprehensive project validation
---

# Validate Workflow

Run comprehensive validation of the project.

Execute the following commands in sequence and report results:

## 1. Backend Linting

```bash
cd backend && uv run ruff check .
```

**Expected:** "All checks passed!" or no output (clean)

## 2. Backend Tests

```bash
cd backend && uv run pytest -v
```

**Expected:** All tests pass

## 3. Backend Tests with Coverage

```bash
cd backend && uv run pytest --cov=app --cov-report=term-missing
```

**Expected:** Coverage >= 80%

## 4. Frontend Build

```bash
cd frontend && npm run build
```

**Expected:** Build completes successfully

## 5. Local Server Validation (Optional)

If backend is not already running:

```bash
cd backend && uv run uvicorn app.main:app --port 8000 &
```

Wait 2 seconds, then test:

```bash
# Test habits endpoint
curl -s http://localhost:8000/api/habits | head -c 200

# Check API docs
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8000/docs
```

**Expected:** JSON response from habits endpoint, HTTP 200 from docs

Stop the server:

```bash
# Windows
taskkill /F /IM uvicorn.exe 2>nul || true

# Linux/Mac
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
```

## 6. Summary Report

After all validations complete, provide summary:

- Linting status
- Tests passed/failed
- Coverage percentage
- Frontend build status
- Any errors or warnings
- **Overall health assessment: PASS/FAIL**
