"""Database connection and session management."""

import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

# Load environment variables
env_file = Path(__file__).parent.parent.parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Fallback: construct from separate components
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "nutritional_db")
    DB_USER = os.getenv("DB_USER", "nutritional_user")
    DB_PASSWORD = os.getenv("DB_PASSWORD")

    if not DB_PASSWORD:
        raise ValueError(
            "Database password not configured! "
            "Set DATABASE_URL or DB_PASSWORD in your .env file. "
            "Never use default passwords in production."
        )

    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create engine (SQLModel uses SQLAlchemy underneath)
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("ENV") == "development",  # SQL logging in dev
    pool_pre_ping=True,  # Verify connections before using
    pool_size=5,  # Connection pool size
    max_overflow=10,  # Max connections beyond pool_size
)


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
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_engine():
    """Get the database engine (for testing, migrations).

    Returns:
        SQLAlchemy Engine
    """
    return engine


def create_db_and_tables():
    """Create all tables (for testing/initial setup).

    In production, use Alembic migrations instead.
    """
    SQLModel.metadata.create_all(engine)


def test_connection() -> bool:
    """Test database connection.

    Returns:
        True if connection successful, False otherwise
    """
    try:
        from sqlmodel import text

        with get_db_session() as session:
            session.exec(text("SELECT 1"))
            return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False
