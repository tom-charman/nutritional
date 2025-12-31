"""Storage factory to provide the configured storage backend."""

from nutritional.data_entry.sqlmodel_storage import SQLModelStorage


def get_storage():
    """Get the configured storage backend.

    Phase 2: Always returns SQLModelStorage (PostgreSQL with SQLModel ORM) for data entry.
    Visualization continues to use Google Sheets via loaders.py.

    Returns:
        SQLModelStorage instance
    """
    return SQLModelStorage()
