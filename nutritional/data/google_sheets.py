"""Google Sheets API integration for loading nutritional data.

This module provides Google Sheets API integration using service account authentication.
"""

import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


# Scopes required for reading Google Sheets
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']


class GoogleSheetsClient:
    """
    Wrapper for Google Sheets API operations using service account authentication.
    
    Features:
    - Service account authentication (no user interaction needed)
    - Read data from specific ranges
    - Get last modified timestamp
    - Validate sheet access
    """
    
    def __init__(self, credentials_path: Optional[str] = None):
        """
        Initialize Google Sheets client with service account credentials.
        
        Args:
            credentials_path: Path to service account credentials JSON file.
                            If None, uses GOOGLE_CREDENTIALS_PATH env var.
                            
        Raises:
            FileNotFoundError: If credentials file doesn't exist
            ValueError: If credentials are invalid
        """
        # Determine credentials path
        if credentials_path is None:
            credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH')
        
        if not credentials_path:
            raise ValueError(
                "No credentials path provided. Set GOOGLE_CREDENTIALS_PATH "
                "environment variable or pass credentials_path parameter."
            )
        
        creds_file = Path(credentials_path)
        if not creds_file.exists():
            raise FileNotFoundError(
                f"Credentials file not found: {credentials_path}\n"
                "Please download your service account JSON from Google Cloud Console."
            )
        
        # Authenticate
        try:
            self.credentials = service_account.Credentials.from_service_account_file(
                str(creds_file), scopes=SCOPES
            )
        except Exception as e:
            raise ValueError(f"Failed to load credentials: {e}")
        
        # Build Google Sheets API service
        self.sheets_service = build('sheets', 'v4', credentials=self.credentials)
        self.drive_service = build('drive', 'v3', credentials=self.credentials)
    
    def get_spreadsheet_data(self, 
                            spreadsheet_id: str,
                            range_name: str = 'A:Z') -> List[List[Any]]:
        """
        Fetch data from Google Sheet.
        
        Args:
            spreadsheet_id: The ID from the sheet URL 
                          (e.g., '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
            range_name: A1 notation range (default: 'A:Z' for all columns)
            
        Returns:
            List of rows, each row is a list of cell values.
            Empty cells are represented as empty strings.
            
        Raises:
            HttpError: If API request fails (e.g., permission denied, not found)
        """
        try:
            result = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueRenderOption='UNFORMATTED_VALUE',
                dateTimeRenderOption='FORMATTED_STRING'
            ).execute()
            
            values = result.get('values', [])
            return values
            
        except HttpError as e:
            if e.resp.status == 404:
                raise HttpError(
                    e.resp,
                    f"Spreadsheet not found: {spreadsheet_id}. Check the ID is correct.".encode()
                )
            elif e.resp.status == 403:
                raise HttpError(
                    e.resp,
                    (f"Access denied to spreadsheet: {spreadsheet_id}. "
                     "Make sure the service account has been granted access.").encode()
                )
            else:
                raise
    
    def get_last_modified(self, spreadsheet_id: str) -> str:
        """
        Get the last modified timestamp of the spreadsheet.
        
        Args:
            spreadsheet_id: The ID from the sheet URL
            
        Returns:
            ISO format timestamp string (e.g., '2025-11-22T14:30:00Z')
            
        Raises:
            HttpError: If API request fails
        """
        try:
            file_metadata = self.drive_service.files().get(
                fileId=spreadsheet_id,
                fields='modifiedTime'
            ).execute()
            
            return file_metadata.get('modifiedTime', datetime.now().isoformat())
            
        except HttpError:
            # Fallback to current time if we can't get modified time
            return datetime.now().isoformat()
    
    def validate_sheet_access(self, spreadsheet_id: str) -> bool:
        """
        Check if the service account has access to the sheet.
        
        Args:
            spreadsheet_id: The ID from the sheet URL
            
        Returns:
            True if accessible, False otherwise
        """
        try:
            self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id
            ).execute()
            return True
        except HttpError:
            return False
    
    def get_spreadsheet_info(self, spreadsheet_id: str) -> dict:
        """
        Get metadata about the spreadsheet.
        
        Args:
            spreadsheet_id: The ID from the sheet URL
            
        Returns:
            Dict with keys: title, sheets (list of sheet names), url
            
        Raises:
            HttpError: If API request fails
        """
        try:
            spreadsheet = self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id
            ).execute()
            
            return {
                'title': spreadsheet.get('properties', {}).get('title', 'Unknown'),
                'sheets': [
                    sheet['properties']['title'] 
                    for sheet in spreadsheet.get('sheets', [])
                ],
                'url': f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
            }
        except HttpError:
            raise
        raise NotImplementedError("To be implemented in Phase 4")


def load_from_google_sheets(spreadsheet_id: str,  # pragma: no cover
                           range_name: str = 'A:Z',
                           credentials_path: Optional[str] = None) -> dict:
    """
    Load nutritional data from Google Sheets.
    
    This will be implemented in Phase 4 of the refactor plan.
    
    Args:
        spreadsheet_id: Google Sheets ID from URL
        range_name: A1 notation range
        credentials_path: Path to service account JSON
        
    Returns:
        Standardized data dict matching load_from_csv format
        
    Raises:
        NotImplementedError: This feature is not yet available
    """
    raise NotImplementedError(
        "Google Sheets integration will be implemented in Phase 4. "
        "For now, please use load_from_csv() with local CSV files."
    )
