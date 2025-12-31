"""Database connection and utilities for PostgreSQL."""

import os
from collections.abc import Generator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

if TYPE_CHECKING:
    from psycopg2.extensions import connection, cursor

# Load environment variables
load_dotenv()


def get_connection_string() -> str:
    """Get database connection string from environment.

    Returns:
        PostgreSQL connection string
    """
    return os.getenv(
        "DATABASE_URL", "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_db"
    )


@contextmanager
def get_db_connection() -> Generator["connection", Any]:
    """Context manager for database connections.

    Yields:
        Database connection

    Example:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM food_items")
    """
    conn = psycopg2.connect(get_connection_string())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def get_db_cursor(cursor_factory=RealDictCursor) -> Generator["cursor", Any]:
    """Context manager for database cursor with automatic connection handling.

    Args:
        cursor_factory: Cursor factory to use (default: RealDictCursor for dict results)

    Yields:
        Database cursor

    Example:
        with get_db_cursor() as cur:
            cur.execute("SELECT * FROM food_items")
            items = cur.fetchall()
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cursor
        finally:
            cursor.close()


def test_connection() -> bool:
    """Test database connection.

    Returns:
        True if connection successful, False otherwise
    """
    try:
        with get_db_cursor() as cur:
            cur.execute("SELECT 1")
            result = cur.fetchone()
            return result is not None
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False
