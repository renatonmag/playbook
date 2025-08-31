from fastapi.middleware.cors import CORSMiddleware
from routes.qa_router import qa_router as qa_router_v1

from fastapi import FastAPI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qa_router_v1)
