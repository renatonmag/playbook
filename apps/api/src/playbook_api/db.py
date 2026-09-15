"""The connection to the Postgres on Supabase, and nothing else.

Only `store/` is meant to import `get_session`. A router asks for it as a dependency and
hands it straight to the store; it never issues a query of its own.
"""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlmodel import Session, create_engine

#: `apps/api/.env`, resolved from this file rather than the working directory. A relative
#: `env_file` is read relative to *cwd*, so `uvicorn` launched from the repo root found nothing
#: and every request died on a missing `database_url`.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Read from `apps/api/.env`, which is gitignored — see `.env.example` for the shape."""

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # Use Supabase's *Session pooler* host (port 5432), not the direct connection: the
    # direct one is IPv6-only on new projects and fails on an IPv4 network.
    database_url: str


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the env file


@lru_cache
def get_engine():
    return create_engine(_with_psycopg_driver(get_settings().database_url))


def _with_psycopg_driver(url: str) -> str:
    """Point a bare `postgresql://` URL at psycopg 3.

    Supabase's dashboard hands out the bare form, and SQLAlchemy reads that as psycopg2 —
    which is not installed, and is not what we want. Fixing it here means the string can be
    pasted into `.env` unedited.
    """
    prefix = "postgresql://"
    return f"postgresql+psycopg://{url[len(prefix):]}" if url.startswith(prefix) else url


def get_session() -> Iterator[Session]:
    """FastAPI dependency. Tests override this rather than reaching a real database."""
    with Session(get_engine()) as session:
        yield session
