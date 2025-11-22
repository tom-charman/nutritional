"""Tests for Google Sheets API integration.

Tests verify Google Sheets client initialization, data fetching,
and error handling using mocks to avoid real API calls.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from googleapiclient.errors import HttpError


def test_client_init_with_explicit_path(tmp_path, monkeypatch):
    """GoogleSheetsClient should initialize with explicit credentials path."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    # Create a mock credentials file
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{"type": "service_account"}')
    
    # Mock the Google API calls
    mock_credentials = Mock()
    mock_build = Mock()
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('nutritional.data.google_sheets.build', return_value=mock_build):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            
            assert client.credentials == mock_credentials
            assert client.sheets_service == mock_build
            assert client.drive_service == mock_build


def test_client_init_with_env_var(tmp_path, monkeypatch):
    """GoogleSheetsClient should use GOOGLE_CREDENTIALS_PATH env var."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{"type": "service_account"}')
    
    monkeypatch.setenv('GOOGLE_CREDENTIALS_PATH', str(creds_file))
    
    mock_credentials = Mock()
    mock_build = Mock()
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('nutritional.data.google_sheets.build', return_value=mock_build):
            client = GoogleSheetsClient()
            
            assert client.credentials == mock_credentials


def test_client_init_without_credentials_raises_error(monkeypatch):
    """GoogleSheetsClient should raise ValueError without credentials path."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    # Make sure env var is not set
    monkeypatch.delenv('GOOGLE_CREDENTIALS_PATH', raising=False)
    
    with pytest.raises(ValueError, match="No credentials path provided"):
        GoogleSheetsClient(credentials_path=None)


def test_client_init_with_missing_file_raises_error():
    """GoogleSheetsClient should raise FileNotFoundError for missing credentials."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    with pytest.raises(FileNotFoundError, match="Credentials file not found"):
        GoogleSheetsClient(credentials_path="/nonexistent/path.json")


def test_client_init_with_invalid_credentials(tmp_path):
    """GoogleSheetsClient should raise ValueError for invalid credentials."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "bad_credentials.json"
    creds_file.write_text('invalid json')
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file', side_effect=Exception("Invalid JSON")):
        with pytest.raises(ValueError, match="Failed to load credentials"):
            GoogleSheetsClient(credentials_path=str(creds_file))


def test_get_spreadsheet_data_returns_values(tmp_path):
    """get_spreadsheet_data should return spreadsheet values."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    # Mock the API response
    mock_values = [
        ['Date', 'Energy kcal', 'Protein g'],
        ['2025-01-01', '2000', '80'],
        ['2025-01-02', '2100', '85']
    ]
    
    # Create a proper mock chain
    mock_execute = MagicMock(return_value={'values': mock_values})
    mock_get = MagicMock(return_value=MagicMock(execute=mock_execute))
    mock_values_api = MagicMock()
    mock_values_api.get = mock_get
    mock_spreadsheets = MagicMock()
    mock_spreadsheets.values.return_value = mock_values_api
    mock_service = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.get_spreadsheet_data('test_id', 'Sheet1!A:Z')
            
            assert result == mock_values
            mock_get.assert_called_once_with(
                spreadsheetId='test_id',
                range='Sheet1!A:Z',
                valueRenderOption='UNFORMATTED_VALUE',
                dateTimeRenderOption='FORMATTED_STRING'
            )


def test_get_spreadsheet_data_with_empty_sheet(tmp_path):
    """get_spreadsheet_data should handle empty sheets."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_service = MagicMock()
    mock_service.spreadsheets().values().get().execute.return_value = {}
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.get_spreadsheet_data('test_id')
            
            assert result == []


def test_get_spreadsheet_data_404_error(tmp_path):
    """get_spreadsheet_data should raise HttpError for 404."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    # Create a mock HttpError with bytes content
    mock_resp = Mock()
    mock_resp.status = 404
    http_error = HttpError(mock_resp, b'Not found')
    
    # Create a proper mock chain
    mock_execute = MagicMock(side_effect=http_error)
    mock_get = MagicMock(return_value=MagicMock(execute=mock_execute))
    mock_values_api = MagicMock()
    mock_values_api.get = mock_get
    mock_spreadsheets = MagicMock()
    mock_spreadsheets.values.return_value = mock_values_api
    mock_service = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            
            with pytest.raises(HttpError, match="Spreadsheet not found"):
                client.get_spreadsheet_data('bad_id')


def test_get_spreadsheet_data_403_error(tmp_path):
    """get_spreadsheet_data should raise HttpError for 403."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    # Create a mock HttpError with bytes content
    mock_resp = Mock()
    mock_resp.status = 403
    http_error = HttpError(mock_resp, b'Access denied')
    
    # Create a proper mock chain
    mock_execute = MagicMock(side_effect=http_error)
    mock_get = MagicMock(return_value=MagicMock(execute=mock_execute))
    mock_values_api = MagicMock()
    mock_values_api.get = mock_get
    mock_spreadsheets = MagicMock()
    mock_spreadsheets.values.return_value = mock_values_api
    mock_service = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            
            with pytest.raises(HttpError, match="Access denied"):
                client.get_spreadsheet_data('forbidden_id')


def test_get_last_modified_returns_timestamp(tmp_path):
    """get_last_modified should return modification timestamp."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    expected_time = '2025-11-22T14:30:00Z'
    mock_drive_service = MagicMock()
    mock_drive_service.files().get().execute.return_value = {
        'modifiedTime': expected_time
    }
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build') as mock_build:
            # Return different mocks for sheets and drive services
            mock_build.side_effect = [Mock(), mock_drive_service]
            
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.get_last_modified('test_id')
            
            assert result == expected_time


def test_get_last_modified_fallback_on_error(tmp_path):
    """get_last_modified should fallback to current time on error."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_resp = Mock()
    mock_resp.status = 403
    http_error = HttpError(mock_resp, b'Access denied')
    
    mock_drive_service = MagicMock()
    mock_drive_service.files().get().execute.side_effect = http_error
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build') as mock_build:
            mock_build.side_effect = [Mock(), mock_drive_service]
            
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.get_last_modified('test_id')
            
            # Should return some timestamp (current time)
            assert isinstance(result, str)
            assert 'T' in result  # ISO format


def test_validate_sheet_access_returns_true(tmp_path):
    """validate_sheet_access should return True for accessible sheets."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_service = MagicMock()
    mock_service.spreadsheets().get().execute.return_value = {'spreadsheetId': 'test'}
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.validate_sheet_access('test_id')
            
            assert result is True


def test_validate_sheet_access_returns_false_on_error(tmp_path):
    """validate_sheet_access should return False for inaccessible sheets."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_resp = Mock()
    mock_resp.status = 404
    http_error = HttpError(mock_resp, b'Not found')
    
    mock_service = MagicMock()
    mock_service.spreadsheets().get().execute.side_effect = http_error
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.validate_sheet_access('bad_id')
            
            assert result is False


def test_get_spreadsheet_info_returns_metadata(tmp_path):
    """get_spreadsheet_info should return spreadsheet metadata."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_response = {
        'properties': {'title': 'My Nutrition Data'},
        'sheets': [
            {'properties': {'title': 'Daily'}},
            {'properties': {'title': 'Weekly'}}
        ]
    }
    
    mock_service = MagicMock()
    mock_service.spreadsheets().get().execute.return_value = mock_response
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            result = client.get_spreadsheet_info('test_id')
            
            assert result['title'] == 'My Nutrition Data'
            assert result['sheets'] == ['Daily', 'Weekly']
            assert 'test_id' in result['url']


def test_get_spreadsheet_info_raises_on_error(tmp_path):
    """get_spreadsheet_info should raise HttpError on failure."""
    from nutritional.data.google_sheets import GoogleSheetsClient
    
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text('{}')
    
    mock_resp = Mock()
    mock_resp.status = 404
    http_error = HttpError(mock_resp, b'Not found')
    
    mock_service = MagicMock()
    mock_service.spreadsheets().get().execute.side_effect = http_error
    
    with patch('nutritional.data.google_sheets.service_account.Credentials.from_service_account_file'):
        with patch('nutritional.data.google_sheets.build', return_value=mock_service):
            client = GoogleSheetsClient(credentials_path=str(creds_file))
            
            with pytest.raises(HttpError):
                client.get_spreadsheet_info('bad_id')
