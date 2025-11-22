"""
Additional tests for improved coverage.

Tests for alternative date formats and edge cases in loaders.
"""

import numpy as np


def test_load_csv_with_alternative_date_format(tmp_path):
    """CSV loader should handle DD/MM/YYYY date format."""
    from nutritional.data.loaders import load_from_csv
    
    # Create CSV with DD/MM/YYYY format
    csv_file = tmp_path / "dates_alt_format.csv"
    csv_content = """Date,Energy kcal,Weight Kg (Morning),Weight Kg (Evening),Protein g,Carbohydrates g,Fat g,Saturated Fat g
22/11/2025,2000,70.0,70.5,150,200,70,20
23/11/2025,2100,70.1,70.6,160,210,75,22
24/11/2025,1900,70.2,70.7,140,190,65,18
"""
    csv_file.write_text(csv_content)
    
    data = load_from_csv(str(csv_file))
    
    # Should parse dates correctly
    assert len(data['dates']) == 3
    assert data['dates'][0] == np.datetime64('2025-11-22')
    assert data['dates'][1] == np.datetime64('2025-11-23')
    assert data['dates'][2] == np.datetime64('2025-11-24')


def test_load_csv_with_malformed_date_skips_row(tmp_path):
    """CSV loader should skip rows with malformed dates."""
    from nutritional.data.loaders import load_from_csv
    
    # Create CSV with one bad date
    csv_file = tmp_path / "bad_dates.csv"
    csv_content = """Date,Energy kcal,Weight Kg (Morning),Weight Kg (Evening),Protein g,Carbohydrates g,Fat g,Saturated Fat g
2025-11-22,2000,70.0,70.5,150,200,70,20
invalid-date,2100,70.1,70.6,160,210,75,22
2025-11-24,1900,70.2,70.7,140,190,65,18
"""
    csv_file.write_text(csv_content)
    
    data = load_from_csv(str(csv_file))
    
    # Should only have 2 valid rows
    assert len(data['dates']) == 2
    assert data['dates'][0] == np.datetime64('2025-11-22')
    assert data['dates'][1] == np.datetime64('2025-11-24')


def test_load_csv_with_malformed_alternative_date(tmp_path):
    """CSV loader should skip rows with malformed DD/MM/YYYY dates."""
    from nutritional.data.loaders import load_from_csv
    
    # Create CSV with bad DD/MM/YYYY format (incomplete)
    csv_file = tmp_path / "bad_alt_dates.csv"
    csv_content = """Date,Energy kcal,Weight Kg (Morning),Weight Kg (Evening),Protein g,Carbohydrates g,Fat g,Saturated Fat g
22/11/2025,2000,70.0,70.5,150,200,70,20
23/11,2100,70.1,70.6,160,210,75,22
24/11/2025,1900,70.2,70.7,140,190,65,18
"""
    csv_file.write_text(csv_content)
    
    data = load_from_csv(str(csv_file))
    
    # Should only have 2 valid rows (skip the incomplete date)
    assert len(data['dates']) == 2
    assert data['dates'][0] == np.datetime64('2025-11-22')
    assert data['dates'][1] == np.datetime64('2025-11-24')


def test_get_data_source_with_env_variable(tmp_path, monkeypatch):
    """get_data_source should use LOCAL_CSV_PATH environment variable."""
    from nutritional.data.loaders import get_data_source
    from nutritional import settings
    
    # Create a CSV file
    csv_file = tmp_path / "env_data.csv"
    csv_content = """Date,Energy kcal,Weight Kg (Morning),Weight Kg (Evening),Protein g,Carbohydrates g,Fat g,Saturated Fat g
2025-11-22,2000,70.0,70.5,150,200,70,20
"""
    csv_file.write_text(csv_content)
    
    # Mock settings to use the test CSV file
    monkeypatch.setattr(settings, 'LOCAL_CSV_PATH', str(csv_file))
    monkeypatch.setattr(settings, 'GOOGLE_SHEETS_ID', None)
    monkeypatch.setattr(settings, 'GOOGLE_CREDENTIALS_PATH', None)
    
    data = get_data_source()
    
    assert data['source'] == 'CSV'
    assert len(data['dates']) == 1


def test_get_data_source_with_alternate_path(monkeypatch, tmp_path):
    """get_data_source should try alternate path for different working directories."""
    from nutritional.data.loaders import get_data_source
    from nutritional import settings
    from pathlib import Path
    
    # Create a mock CSV file in a temp location
    csv_file = tmp_path / "local_data" / "Food - Daily.csv"
    csv_file.parent.mkdir(parents=True, exist_ok=True)
    csv_content = """Date,Energy kcal,Weight Kg (Morning),Weight Kg (Evening),Protein g,Carbohydrates g,Fat g,Saturated Fat g
2025-11-22,2000,70.0,70.5,150,200,70,20
"""
    csv_file.write_text(csv_content)
    
    # Mock Path to return our temp directory
    original_cwd = Path.cwd()
    monkeypatch.chdir(tmp_path)
    
    # Mock settings to disable Google Sheets
    monkeypatch.setattr(settings, 'LOCAL_CSV_PATH', None)
    monkeypatch.setattr(settings, 'GOOGLE_SHEETS_ID', None)
    monkeypatch.setattr(settings, 'GOOGLE_CREDENTIALS_PATH', None)
    
    # Should find the CSV in local_data/
    data = get_data_source()
    assert data['source'] == 'CSV'
    assert 'dates' in data
    assert len(data['dates']) == 1
    
    # Restore working directory
    monkeypatch.chdir(original_cwd)
