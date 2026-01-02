"""Database connection and session management."""

import os
from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine

from nutritional.settings import DATABASE_URL

engines = {}


@contextmanager
def get_db_session():
    """Context manager for database sessions.

    Usage:
        with get_db_session() as session:
            from sqlmodel import select
            food_items = session.exec(select(FoodItemModel)).all()

    Yields:
        SQLModel Session
    """
    session = Session(get_engine())
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_engine(pool_pre_ping: bool = True, pool_size: int = 5, max_overflow: int = 10):
    """Get the database engine (for testing, migrations).

    Returns:
        SQLAlchemy Engine
    """
    if DATABASE_URL not in engines:
        engines[DATABASE_URL] = create_engine(
            DATABASE_URL,
            echo=os.getenv("ENV") == "development",  # SQL logging in dev
            pool_pre_ping=pool_pre_ping,  # Verify connections before using
            pool_size=pool_size,  # Connection pool size
            max_overflow=max_overflow,  # Max connections beyond pool_size
        )
    return engines[DATABASE_URL]


def create_db_and_tables():
    """Create all tables (for testing/initial setup).

    In production, use Alembic migrations instead.
    """
    SQLModel.metadata.create_all(get_engine())
