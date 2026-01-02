"""Data loading functions for PostgreSQL database.

Phase 3: All data now loaded from PostgreSQL.
CSV and Google Sheets functions are deprecated.
"""

from datetime import datetime as dt

import numpy as np
from sqlmodel import select

from nutritional.database.connection import get_db_session
from nutritional.database.models import DailySummaryModel


def load_data() -> dict:
    """Load nutritional data from PostgreSQL database.

    Returns:
        dict with keys:
            - 'dates': np.array of datetime64 objects
            - 'data': dict of {column_name: np.array}
            - 'columns': list of column names
            - 'source': 'PostgreSQL'
            - 'last_updated': str timestamp

    Raises:
        ValueError: If no data found in database
    """
    try:
        with get_db_session() as session:
            # Get daily summaries ordered by date
            statement = select(DailySummaryModel).order_by(DailySummaryModel.summary_date)
            summaries = session.exec(statement).all()

            if not summaries:
                raise ValueError("No data found in PostgreSQL database")

            # Parse data into lists
            dates_list = []
            data_lists = {
                "Energy kcal": [],
                "Fat g": [],
                "Saturated Fat g": [],
                "Carbohydrates g": [],
                "Sugar g": [],
                "Protein g": [],
                "Fibre g": [],
                "Salt g": [],
                "Calcium mg": [],
                "Weight Kg (Morning)": [],
                "Weight Kg (Evening)": [],
            }

            for summary in summaries:
                dates_list.append(np.datetime64(summary.summary_date))
                data_lists["Energy kcal"].append(
                    float(summary.energy_kcal) if summary.energy_kcal is not None else np.nan
                )
                data_lists["Fat g"].append(
                    float(summary.fat_g) if summary.fat_g is not None else np.nan
                )
                data_lists["Saturated Fat g"].append(
                    float(summary.saturated_fat_g)
                    if summary.saturated_fat_g is not None
                    else np.nan
                )
                data_lists["Carbohydrates g"].append(
                    float(summary.carbohydrates_g)
                    if summary.carbohydrates_g is not None
                    else np.nan
                )
                data_lists["Sugar g"].append(
                    float(summary.sugar_g) if summary.sugar_g is not None else np.nan
                )
                data_lists["Protein g"].append(
                    float(summary.protein_g) if summary.protein_g is not None else np.nan
                )
                data_lists["Fibre g"].append(
                    float(summary.fibre_g) if summary.fibre_g is not None else np.nan
                )
                data_lists["Salt g"].append(
                    float(summary.salt_g) if summary.salt_g is not None else np.nan
                )
                data_lists["Calcium mg"].append(
                    float(summary.calcium_mg) if summary.calcium_mg is not None else np.nan
                )
                data_lists["Weight Kg (Morning)"].append(
                    float(summary.morning_weight_kg)
                    if summary.morning_weight_kg is not None
                    else np.nan
                )
                data_lists["Weight Kg (Evening)"].append(
                    float(summary.evening_weight_kg)
                    if summary.evening_weight_kg is not None
                    else np.nan
                )

            # Convert to numpy arrays
            dates_array = np.array(dates_list)
            data_dict = {col: np.array(vals) for col, vals in data_lists.items()}

            print("Data loaded successfully from PostgreSQL")
            print(f"Date range: {dates_array[0]} to {dates_array[-1]}")
            print(f"Number of records: {len(dates_array)}")

            return {
                "dates": dates_array,
                "data": data_dict,
                "columns": list(data_lists.keys()),
                "source": "PostgreSQL",
                "last_updated": dt.now().isoformat(),
            }

    except Exception as e:
        raise ValueError(f"Error loading from PostgreSQL: {e}")


def get_data_source(csv_path: str | None = None) -> dict:
    """
    Load data from PostgreSQL database.

    Phase 3: All data is now in PostgreSQL.
    This function is maintained for backwards compatibility.

    Args:
        csv_path: Deprecated parameter (ignored)

    Returns:
        Standardized data dictionary from PostgreSQL

    Raises:
        ValueError: If no data found in database
    """
    # Phase 3: Load directly from PostgreSQL
    return load_data()


def filter_by_date_range(
    data: dict,
    start_date: str | np.datetime64 | None = None,
    end_date: str | np.datetime64 | None = None,
) -> dict:
    """
    Filter data dictionary by date range.

    Args:
        data: Data dictionary from load_from_csv
        start_date: Start date in YYYY-MM-DD format (None = no start limit)
        end_date: End date in YYYY-MM-DD format (None = no end limit)

    Returns:
        New data dictionary with filtered dates and data
    """
    dates = data["dates"]

    # Create mask
    mask = np.ones(len(dates), dtype=bool)

    if start_date:
        start_dt = np.datetime64(start_date)
        mask &= dates >= start_dt

    if end_date:
        end_dt = np.datetime64(end_date)
        mask &= dates <= end_dt

    # Apply mask
    filtered_data = {
        "dates": dates[mask],
        "data": {col: arr[mask] for col, arr in data["data"].items()},
        "columns": data["columns"],
        "source": data.get("source", "Unknown"),
    }

    # Copy optional fields if present
    if "last_updated" in data:
        filtered_data["last_updated"] = data["last_updated"]
    if "filepath" in data:
        filtered_data["filepath"] = data["filepath"]

    return filtered_data


# Alias for backwards compatibility
load_from_postgres = load_data
