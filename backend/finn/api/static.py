"""Deployment notes as code: single-source env for Render/Railway/Fly + Vercel.

The backend is a plain FastAPI app; any host that runs `uvicorn` works.

Render (render.yaml approach):
  services:
    - type: web
      name: finn-backend
      runtime: python
      rootDir: backend
      buildCommand: "pip install uv && uv sync --frozen"
      startCommand: "uv run uvicorn finn.api.main:app --host 0.0.0.0 --port $PORT"
      envVars:
        - key: HYDE_API_KEY
          sync: false
        - key: FINN_MODEL_FAST
          value: hyde/glm-5.3-flash
        - key: FINN_MODEL_REASONING
          value: hyde/glm-5.3-flash

The SQLite DB lives on a mounted disk (or ephemeral if demo-only; the seeders
rebuild it in seconds via POST /api/demo/run after first boot).

Frontend (Vercel): root directory `frontend/`, framework Next.js. Set
FINN_BACKEND_URL to the deployed backend URL at build time for the /api rewrite.
"""
