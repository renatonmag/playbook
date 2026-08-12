from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness only. Touches no database and no engine."""
    return {"status": "ok"}
