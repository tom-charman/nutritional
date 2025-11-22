"""Tests for data loading functionality."""

import pytest
import numpy as np

from nutritional.data.loaders import (
    load_from_csv,
    get_data_source,
    filter_by_date_range
)


class TestLoadFromCSV:
    """Tests for load_from_csv function."""
    
    def test_load_valid_csv(self, tmp_path):
        """Test loading a valid CSV file."""
        csv_path = tmp_path / "test_data.csv"
        csv_content = """Date,Energy kcal,Protein g,Fat g
2024-01-01,2000,80,65
2024-01-02,2100,85,70
2024-01-03,1950,78,62
"""
        csv_path.write_text(csv_content)
        
        data = load_from_csv(str(csv_path))
        
        assert 'dates' in data
        assert 'data' in data
        assert 'columns' in data
        assert 'source' in data
        assert data['source'] == 'CSV'
        
        assert len(data['dates']) == 3
        assert len(data['data']['Energy kcal']) == 3
        assert data['data']['Energy kcal'][0] == 2000.0
        assert data['data']['Protein g'][1] == 85.0
    
    def test_load_csv_with_missing_values(self, tmp_path):
        """Test loading CSV with missing values."""
        csv_path = tmp_path / "test_data.csv"
        csv_content = """Date,Energy kcal,Protein g
2024-01-01,2000,80
2024-01-02,,85
2024-01-03,1950,
"""
        csv_path.write_text(csv_content)
        
        data = load_from_csv(str(csv_path))
        
        assert len(data['dates']) == 3
        assert np.isnan(data['data']['Energy kcal'][1])
        assert np.isnan(data['data']['Protein g'][2])
    
    def test_load_csv_date_sorting(self, tmp_path):
        """Test that dates are sorted after loading."""
        csv_path = tmp_path / "test_data.csv"
        csv_content = """Date,Energy kcal
2024-01-03,1950
2024-01-01,2000
2024-01-02,2100
"""
        csv_path.write_text(csv_content)
        
        data = load_from_csv(str(csv_path))
        
        assert data['dates'][0] == np.datetime64('2024-01-01')
        assert data['dates'][1] == np.datetime64('2024-01-02')
        assert data['dates'][2] == np.datetime64('2024-01-03')
        assert data['data']['Energy kcal'][0] == 2000.0
    
    def test_load_nonexistent_file(self):
        """Test loading a file that doesn't exist."""
        with pytest.raises(FileNotFoundError):
            load_from_csv('nonexistent_file.csv')
    
    def test_load_csv_without_date_column(self, tmp_path):
        """Test loading CSV without a Date column."""
        csv_path = tmp_path / "test_data.csv"
        csv_content = """Energy kcal,Protein g
2000,80
2100,85
"""
        csv_path.write_text(csv_content)
        
        with pytest.raises(ValueError, match="Date"):
            load_from_csv(str(csv_path))


class TestFilterByDateRange:
    """Tests for filter_by_date_range function."""
    
    def test_filter_with_start_date(self):
        """Test filtering with only start date."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                             dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100, 1950])
            },
            'columns': ['Energy kcal'],
            'source': 'CSV',
            'last_updated': '2024-01-01'
        }
        
        filtered = filter_by_date_range(data, start_date='2024-01-02')
        
        assert len(filtered['dates']) == 2
        assert filtered['dates'][0] == np.datetime64('2024-01-02')
        assert filtered['data']['Energy kcal'][0] == 2100
    
    def test_filter_with_end_date(self):
        """Test filtering with only end date."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                             dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100, 1950])
            },
            'columns': ['Energy kcal'],
            'source': 'CSV',
            'last_updated': '2024-01-01'
        }
        
        filtered = filter_by_date_range(data, end_date='2024-01-02')
        
        assert len(filtered['dates']) == 2
        assert filtered['dates'][-1] == np.datetime64('2024-01-02')
    
    def test_filter_with_both_dates(self):
        """Test filtering with both start and end dates."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03', 
                              '2024-01-04', '2024-01-05'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100, 1950, 2050, 2020])
            },
            'columns': ['Energy kcal'],
            'source': 'CSV',
            'last_updated': '2024-01-01'
        }
        
        filtered = filter_by_date_range(data, 
                                       start_date='2024-01-02',
                                       end_date='2024-01-04')
        
        assert len(filtered['dates']) == 3
        assert filtered['dates'][0] == np.datetime64('2024-01-02')
        assert filtered['dates'][-1] == np.datetime64('2024-01-04')


class TestGetDataSource:
    """Tests for get_data_source function."""
    
    def test_get_data_source_with_explicit_path(self, tmp_path):
        """Test get_data_source with explicit CSV path."""
        csv_path = tmp_path / "test_data.csv"
        csv_content = """Date,Energy kcal
2024-01-01,2000
"""
        csv_path.write_text(csv_content)
        
        data = get_data_source(csv_path=str(csv_path))
        
        assert data['source'] == 'CSV'
        assert len(data['dates']) == 1
    
    def test_get_data_source_no_file_available(self, monkeypatch):
        """Test get_data_source when no file is available."""
        from pathlib import Path
        
        # Mock Path.exists to always return False
        def mock_exists(self):
            # Return False for any path to simulate no files available
            return False
        
        monkeypatch.setattr(Path, 'exists', mock_exists)
        monkeypatch.delenv('LOCAL_CSV_PATH', raising=False)
        
        with pytest.raises(FileNotFoundError, match="No data source available"):
            get_data_source()
