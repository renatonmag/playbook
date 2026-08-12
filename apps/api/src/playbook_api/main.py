from fastapi import FastAPI

from .routers import health

app = FastAPI(title="Playbook API")

app.include_router(health.router)
