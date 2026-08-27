from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import candles, health, live, patterns, shapes

app = FastAPI(title="Playbook API")

# The Nuxt dev server is a different origin, so every browser call here is cross-origin.
# This gates HTTP only: a WebSocket handshake is not subject to CORS, so `/ws/candles` reaches
# the browser without `allow_methods` growing an entry it would never use.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(candles.router)
app.include_router(patterns.router)
app.include_router(shapes.router)
app.include_router(live.router)
