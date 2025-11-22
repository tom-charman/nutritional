"""Data loading functions for CSV and future Google Sheets integration."""

import os
from pathlib import Path
from typing import Optional
import numpy as np


def load_from_csv(filepath: str) -> dict:
    """
    Load nutritional data from CSV file using NumPy.
    
    Args:
        filepath: Path to the CSV file
        
    Returns:
        dict with keys:
            - 'dates': np.array of datetime64 objects
            - 'data': dict of {column_name: np.array}
            - 'columns': list of column names (excluding Date)
            - 'source': str indicating data source
            - 'last_updated': str timestamp
            
    Raises:
        FileNotFoundError: If the file doesn't exist
        ValueError: If the file format is invalid
    """
    filepath = Path(filepath)
    
    if not filepath.exists():
        raise FileNotFoundError(f"CSV file not found: {filepath}")
    
    try:
        # Read the entire file to get headers and data
        with open(filepath, 'r') as f:
            lines = f.readlines()
        
        if len(lines) < 2:  # pragma: no cover
            raise ValueError("CSV file must have at least a header and one data row")
        
        # Parse header
        headers = [h.strip() for h in lines[0].strip().split(',')]
        
        if 'Date' not in headers:  # pragma: no cover
            raise ValueError("CSV must have a 'Date' column")
        
        date_idx = headers.index('Date')
        data_headers = [h for h in headers if h != 'Date']
        
        # Parse data rows
        dates_list = []
        data_lists = {col: [] for col in data_headers}
        
        for line in lines[1:]:
            line = line.strip()
            if not line:  # Skip empty lines
                continue
                
            values = [v.strip() for v in line.split(',')]
            
            if len(values) <= date_idx:  # pragma: no cover
                continue
                
            date_str = values[date_idx]
            if not date_str:  # pragma: no cover
                continue
            
            # Parse date - try different formats
            try:
                # Try YYYY-MM-DD format first
                date_obj = np.datetime64(date_str)
            except Exception:
                try:
                    # Try DD/MM/YYYY format
                    parts = date_str.split('/')
                    if len(parts) == 3:
                        date_obj = np.datetime64(f"{parts[2]}-{parts[1]:0>2}-{parts[0]:0>2}")
                    else:
                        continue
                except Exception:
                    continue
            
            dates_list.append(date_obj)
            
            # Parse data columns
            for i, col in enumerate(headers):
                if col == 'Date':
                    continue
                    
                col_idx = headers.index(col)
                if col_idx < len(values) and values[col_idx]:
                    try:
                        data_lists[col].append(float(values[col_idx]))
                    except ValueError:
                        data_lists[col].append(np.nan)
                else:
                    data_lists[col].append(np.nan)
        
        if not dates_list:  # pragma: no cover
            raise ValueError("No valid data rows found in CSV")
        
        # Convert to numpy arrays
        dates_array = np.array(dates_list)
        
        # Sort by date
        sort_idx = np.argsort(dates_array)
        dates_array = dates_array[sort_idx]
        
        data_dict = {}
        for col in data_headers:
            data_array = np.array(data_lists[col])
            data_dict[col] = data_array[sort_idx]
        
        # Get file modification time
        last_modified = filepath.stat().st_mtime
        from datetime import datetime
        last_updated = datetime.fromtimestamp(last_modified).isoformat()
        
        print("Data loaded successfully from CSV")
        print(f"Date range: {dates_array[0]} to {dates_array[-1]}")
        print(f"Number of records: {len(dates_array)}")
        print(f"Columns: {', '.join(data_headers[:5])}{'...' if len(data_headers) > 5 else ''}")
        
        return {
            'dates': dates_array,
            'data': data_dict,
            'columns': data_headers,
            'source': 'CSV',
            'last_updated': last_updated,
            'filepath': str(filepath)
        }
        
    except Exception as e:
        raise ValueError(f"Error parsing CSV file: {e}")


def load_from_google_sheets(spreadsheet_id: str,  # pragma: no cover
                           range_name: str = 'A:Z',
                           credentials_path: Optional[str] = None) -> dict:
    """
    Load nutritional data from Google Sheets.
    
    Args:
        spreadsheet_id: Google Sheets ID from URL
                       (e.g., '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
        range_name: A1 notation range (default: 'A:Z' for all columns)
        credentials_path: Path to service account JSON credentials
                         If None, uses GOOGLE_CREDENTIALS_PATH env var
        
    Returns:
        Standardized data dict matching load_from_csv format:
        - 'dates': numpy array of datetime64[D]
        - 'data': dict of column_name -> numpy array
        - 'columns': list of column names
        - 'source': 'Google Sheets'
        - 'last_updated': ISO timestamp string
        
    Raises:
        ValueError: If no data found or Date column missing
        HttpError: If sheet access fails
    """
    from .google_sheets import GoogleSheetsClient  # pragma: no cover
    
    # Initialize client
    client = GoogleSheetsClient(credentials_path)
    
    # Fetch data
    values = client.get_spreadsheet_data(spreadsheet_id, range_name)
    
    if not values or len(values) < 2:  # pragma: no cover
        raise ValueError("No data found in sheet (need header + at least one data row)")
    
    # First row is headers
    headers = [str(h).strip() for h in values[0]]
    data_rows = values[1:]
    
    if 'Date' not in headers:  # pragma: no cover
        raise ValueError("Sheet must have a 'Date' column")
    
    date_idx = headers.index('Date')
    data_headers = [h for h in headers if h != 'Date']
    
    # Parse data rows
    dates_list = []
    data_lists = {col: [] for col in data_headers}
    
    for row in data_rows:
        # Skip empty rows
        if not row or len(row) <= date_idx or not row[date_idx]:
            continue
        
        # Parse date - try multiple formats
        date_str = str(row[date_idx]).strip()
        date_parsed = None
        
        # Try standard YYYY-MM-DD format first
        try:
            date_parsed = np.datetime64(date_str, 'D')
        except (ValueError, TypeError):
            # Try DD/MM/YYYY format (common in Google Sheets)
            try:
                from datetime import datetime
                dt = datetime.strptime(date_str, '%d/%m/%Y')
                date_parsed = np.datetime64(dt.date(), 'D')
            except (ValueError, TypeError):
                # Skip rows with unparseable dates
                continue
        
        if date_parsed is None:
            continue
            
        dates_list.append(date_parsed)
        
        # Parse data columns
        for col_idx, col in enumerate(data_headers):
            actual_idx = headers.index(col)
            if actual_idx < len(row) and row[actual_idx]:
                try:
                    data_lists[col].append(float(row[actual_idx]))
                except (ValueError, TypeError):
                    data_lists[col].append(np.nan)
            else:
                data_lists[col].append(np.nan)
    
    if not dates_list:  # pragma: no cover
        raise ValueError("No valid data rows found in sheet")
    
    # Convert to numpy arrays
    dates_array = np.array(dates_list)
    
    # Sort by date
    sort_idx = np.argsort(dates_array)
    dates_array = dates_array[sort_idx]
    
    for col in data_lists:
        data_lists[col] = np.array(data_lists[col])[sort_idx]
    
    # Get metadata
    last_modified = client.get_last_modified(spreadsheet_id)
    
    return {
        'dates': dates_array,
        'data': data_lists,
        'columns': data_headers,
        'source': 'Google Sheets',
        'last_updated': last_modified,
        'spreadsheet_id': spreadsheet_id
    }


def get_data_source(csv_path: Optional[str] = None) -> dict:
    """
    Load data from the first available source.
    
    Priority logic:
    - If LOCAL_CSV_PATH is set: Try CSV sources first, then Google Sheets as fallback
    - If LOCAL_CSV_PATH is NOT set: Try Google Sheets first, then default CSV paths
    
    CSV sources tried (in order):
    1. Specified csv_path parameter
    2. LOCAL_CSV_PATH environment variable
    3. Default path: local_data/Food - Daily.csv
    4. Alternate default (for different working directories)
    
    Args:
        csv_path: Optional explicit path to CSV file
        
    Returns:
        Standardized data dictionary from load_from_csv or load_from_google_sheets
        
    Raises:
        FileNotFoundError: If no data source is available
    """
    import logging
    from .. import settings
    
    logger = logging.getLogger(__name__)
    
    # Check if LOCAL_CSV_PATH is set
    local_csv_preference = settings.LOCAL_CSV_PATH is not None
    
    # If LOCAL_CSV_PATH is NOT set, try Google Sheets first
    if not local_csv_preference:
        if settings.GOOGLE_SHEETS_ID and settings.GOOGLE_CREDENTIALS_PATH:  # pragma: no cover
            try:  # pragma: no cover
                logger.info(f"Loading data from Google Sheets: {settings.GOOGLE_SHEETS_ID}")
                print(f"Loading data from Google Sheets: {settings.GOOGLE_SHEETS_ID}")
                return load_from_google_sheets(
                    settings.GOOGLE_SHEETS_ID,
                    range_name=settings.GOOGLE_SHEETS_RANGE,
                    credentials_path=settings.GOOGLE_CREDENTIALS_PATH
                )  # pragma: no cover
            except Exception as e:  # pragma: no cover
                logger.warning(f"Failed to load from Google Sheets: {e}")
                print(f"Warning: Failed to load from Google Sheets: {e}")
                print("Attempting to fall back to local CSV...")
    
    # Try specified CSV path
    if csv_path and os.path.exists(csv_path):
        logger.info(f"Loading data from specified CSV path: {csv_path}")
        return load_from_csv(csv_path)
    
    # Try environment variable
    if settings.LOCAL_CSV_PATH and os.path.exists(settings.LOCAL_CSV_PATH):
        logger.info(f"Loading data from LOCAL_CSV_PATH: {settings.LOCAL_CSV_PATH}")
        return load_from_csv(settings.LOCAL_CSV_PATH)
    
    # Try default path
    default_path = Path('local_data') / 'Food - Daily.csv'
    if default_path.exists():
        logger.info(f"Loading data from default path: {default_path}")
        return load_from_csv(str(default_path))
    
    # Try alternate default path (for running from different directories)
    alt_default_path = Path(__file__).parent.parent.parent / 'local_data' / 'Food - Daily.csv'
    if alt_default_path.exists():
        logger.info(f"Loading data from alternate default path: {alt_default_path}")
        return load_from_csv(str(alt_default_path))
    
    # If LOCAL_CSV_PATH IS set but we're here, try Google Sheets as last resort
    if local_csv_preference:
        if settings.GOOGLE_SHEETS_ID and settings.GOOGLE_CREDENTIALS_PATH:  # pragma: no cover
            try:  # pragma: no cover
                logger.info(f"CSV paths failed, trying Google Sheets: {settings.GOOGLE_SHEETS_ID}")
                print(f"Local CSV not found, trying Google Sheets: {settings.GOOGLE_SHEETS_ID}")
                return load_from_google_sheets(
                    settings.GOOGLE_SHEETS_ID,
                    range_name=settings.GOOGLE_SHEETS_RANGE,
                    credentials_path=settings.GOOGLE_CREDENTIALS_PATH
                )  # pragma: no cover
            except Exception as e:  # pragma: no cover
                logger.error(f"Failed to load from Google Sheets: {e}")
                print(f"Error: Failed to load from Google Sheets: {e}")
    
    # No data source available - provide helpful error message
    error_msg = (
        "\n" + "="*80 + "\n"
        "ERROR: No data source available!\n"
        "\n"
        "To fix this, you need to configure at least one data source:\n"
        "\n"
        "Option 1 - Local CSV File:\n"
        "  Set LOCAL_CSV_PATH in your .env file, for example:\n"
        "    LOCAL_CSV_PATH=local_data/Food - Daily.csv\n"
        "  Or place a CSV file at: local_data/Food - Daily.csv\n"
        "\n"
        "Option 2 - Google Sheets:\n"
        "  1. Set GOOGLE_SHEETS_ID in your .env file\n"
        "  2. Set GOOGLE_SHEETS_RANGE (e.g., 'Sheet1!A:Z')\n"
        "  3. Set GOOGLE_CREDENTIALS_PATH to your service account JSON\n"
        "  4. See docs/google-sheets-setup.md for detailed instructions\n"
        "\n"
        "Current configuration:\n"
        f"  LOCAL_CSV_PATH: {'Set' if settings.LOCAL_CSV_PATH else 'Not set'}\n"
        f"  GOOGLE_SHEETS_ID: {'Set' if settings.GOOGLE_SHEETS_ID else 'Not set'}\n"
        f"  GOOGLE_CREDENTIALS_PATH: {'Set' if settings.GOOGLE_CREDENTIALS_PATH else 'Not set'}\n"
        "="*80
    )
    logger.error(error_msg)
    raise FileNotFoundError(error_msg)  # pragma: no cover


def filter_by_date_range(data: dict, 
                        start_date: Optional[str] = None,
                        end_date: Optional[str] = None) -> dict:
    """
    Filter data dictionary by date range.
    
    Args:
        data: Data dictionary from load_from_csv
        start_date: Start date in YYYY-MM-DD format (None = no start limit)
        end_date: End date in YYYY-MM-DD format (None = no end limit)
        
    Returns:
        New data dictionary with filtered dates and data
    """
    dates = data['dates']
    
    # Create mask
    mask = np.ones(len(dates), dtype=bool)
    
    if start_date:
        start_dt = np.datetime64(start_date)
        mask &= (dates >= start_dt)
    
    if end_date:
        end_dt = np.datetime64(end_date)
        mask &= (dates <= end_dt)
    
    # Apply mask
    filtered_data = {
        'dates': dates[mask],
        'data': {col: arr[mask] for col, arr in data['data'].items()},
        'columns': data['columns'],
        'source': data.get('source', 'Unknown'),
    }
    
    # Copy optional fields if present
    if 'last_updated' in data:
        filtered_data['last_updated'] = data['last_updated']
    if 'filepath' in data:
        filtered_data['filepath'] = data['filepath']
    
    return filtered_data
