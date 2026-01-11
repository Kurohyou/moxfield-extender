---
description: Initialize and start the project locally
---

# Initialize Project Workflow

Set up and start the application locally.

## 1. Install Backend Dependencies

```bash
cd backend && uv sync
```

Installs all Python packages including dev dependencies.

## 2. Install Frontend Dependencies

```bash
cd frontend && npm install
```

Installs React, Vite, and other frontend packages.

## 3. Start Backend Server

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

Starts FastAPI server with hot-reload on port 8000.

## 4. Start Frontend Server (new terminal)

```bash
cd frontend && npm run dev
```

Starts Vite dev server on port 5173.

## 5. Validate Setup

```bash
# Test API health
curl -s http://localhost:8000/api/habits

# Check Swagger docs load
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8000/docs
```

## Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

## Cleanup

To stop services: Ctrl+C in each terminal

## Notes

- No environment file (.env) required - uses SQLite with defaults
- Database file created at `backend/habits.db` on first API call
- Backend and frontend can be started in any order
