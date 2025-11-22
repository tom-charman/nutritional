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
        
        if len(lines) < 2:
            raise ValueError("CSV file must have at least a header and one data row")
        
        # Parse header
        headers = [h.strip() for h in lines[0].strip().split(',')]
        
        if 'Date' not in headers:
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
            
            if len(values) <= date_idx:
                continue
                
            date_str = values[date_idx]
            if not date_str:
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
        
        if not dates_list:
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


def get_data_source(csv_path: Optional[str] = None) -> dict:
    """
    Intelligently select and load data from best available source.
    Currently only supports CSV, will be extended for Google Sheets.
    
    Priority order:
    1. Google Sheets (if configured) - Phase 4
    2. Specified CSV path
    3. Environment variable LOCAL_CSV_PATH
    4. Default path: local_data/Food - Daily.csv
    
    Args:
        csv_path: Optional explicit path to CSV file
        
    Returns:
        Standardized data dictionary from load_from_csv
        
    Raises:
        FileNotFoundError: If no data source is available
    """
    # TODO: Phase 4 - Try Google Sheets first
    # spreadsheet_id = os.getenv('GOOGLE_SHEETS_ID')
    # credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH')
    # if spreadsheet_id and credentials_path:
    #     try:
    #         return load_from_google_sheets(spreadsheet_id, credentials_path=credentials_path)
    #     except Exception as e:
    #         print(f"Failed to load from Google Sheets: {e}")
    
    # Try specified CSV path
    if csv_path and os.path.exists(csv_path):
        return load_from_csv(csv_path)
    
    # Try environment variable
    env_csv_path = os.getenv('LOCAL_CSV_PATH')
    if env_csv_path and os.path.exists(env_csv_path):
        return load_from_csv(env_csv_path)
    
    # Try default path
    default_path = Path('local_data') / 'Food - Daily.csv'
    if default_path.exists():
        return load_from_csv(str(default_path))
    
    # Try alternate default path (for running from different directories)
    alt_default_path = Path(__file__).parent.parent.parent / 'local_data' / 'Food - Daily.csv'
    if alt_default_path.exists():
        return load_from_csv(str(alt_default_path))
    
    raise FileNotFoundError(
        "No data source available. Please provide a CSV file path or set LOCAL_CSV_PATH environment variable."
    )


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
        'source': data['source'],
        'last_updated': data['last_updated']
    }
    
    if 'filepath' in data:
        filtered_data['filepath'] = data['filepath']
    
    return filtered_data
