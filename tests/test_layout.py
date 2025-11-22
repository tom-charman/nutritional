"""Tests for the dashboard layout module."""
import pytest


def test_get_layout_returns_container():
    """get_layout should return a Dash container component."""
    from nutritional.layout import get_layout
    
    layout = get_layout()
    
    # Should return a component (not None)
    assert layout is not None
    # Should have children
    assert hasattr(layout, 'children')


def test_layout_contains_header():
    """Layout should contain header elements."""
    from nutritional.layout import get_layout
    from dash import html
    
    layout = get_layout()
    
    # Convert layout to string to check for header text
    layout_str = str(layout)
    assert 'Nutritional Dashboard' in layout_str or 'nutritional' in layout_str.lower()


def test_layout_contains_controls():
    """Layout should contain control components."""
    from nutritional.layout import get_layout
    
    layout = get_layout()
    layout_str = str(layout)
    
    # Should have some control elements
    assert 'rolling-window' in layout_str or 'window' in layout_str.lower()


def test_layout_contains_graph_placeholders():
    """Layout should contain graph placeholder components."""
    from nutritional.layout import get_layout
    
    layout = get_layout()
    layout_str = str(layout)
    
    # Should have graph IDs (note: nutrients-rdi-plot, not nutrients-plot)
    assert 'calories-weight-plot' in layout_str
    assert 'macro-breakdown-plot' in layout_str
    assert 'nutrients-rdi-plot' in layout_str


def test_layout_contains_data_store():
    """Layout should contain a Store component for data."""
    from nutritional.layout import get_layout
    
    layout = get_layout()
    layout_str = str(layout)
    
    # Should have a data store
    assert 'data-store' in layout_str


def test_layout_contains_summary_stats():
    """Layout should contain summary statistics placeholders."""
    from nutritional.layout import get_layout
    
    layout = get_layout()
    layout_str = str(layout)
    
    # Should have stat card IDs
    assert 'avg-calories' in layout_str or 'calories' in layout_str.lower()
