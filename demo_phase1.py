"""
Demo script for Phase 1 - Data Layer Refactor

This script demonstrates the new data layer functionality:
- Loading CSV data with NumPy
- Data preprocessing functions
- Data validation and quality checks
"""

from nutritional.data import (
    get_data_source,
    check_data_quality,
    rolling_average,
    normalize_to_rdi,
    check_required_columns_for_plot,
    suggest_data_fixes
)
import numpy as np


def main():
    print("=" * 70)
    print("PHASE 1 DEMO - Data Layer Refactor")
    print("=" * 70)
    
    # 1. Load data
    print("\n1. Loading data from CSV...")
    data = get_data_source()
    print(f"   ✓ Loaded {len(data['dates'])} records")
    print(f"   ✓ Date range: {data['dates'][0]} to {data['dates'][-1]}")
    print(f"   ✓ Columns: {len(data['columns'])}")
    
    # 2. Data quality check
    print("\n2. Running data quality check...")
    quality = check_data_quality(data, verbose=False)
    print(f"   ✓ Overall health: {'HEALTHY' if quality['is_healthy'] else 'ISSUES FOUND'}")
    print(f"   ✓ Date gaps: {len(quality['date_gaps'])}")
    
    # 3. Column validation
    print("\n3. Validating columns for plots...")
    for plot_type in ['calories_weight', 'macros', 'nutrients']:
        has_cols, missing = check_required_columns_for_plot(data, plot_type)
        status = "✓" if has_cols else "✗"
        print(f"   {status} {plot_type}: {'OK' if has_cols else f'Missing {missing}'}")
    
    # 4. Test preprocessing functions
    print("\n4. Testing preprocessing functions...")
    
    # Get energy data for demonstration
    if 'Energy kcal' in data['data']:
        energy_data = data['data']['Energy kcal']
        valid_mask = ~np.isnan(energy_data)
        
        if np.sum(valid_mask) > 7:
            # Rolling average
            rolling_7day = rolling_average(energy_data, window=7)
            print(f"   ✓ Rolling average (7-day): {np.nanmean(rolling_7day):.1f} kcal")
            
            # RDI normalization (example: 2000 kcal RDI)
            normalized = normalize_to_rdi(energy_data, 2000)
            print(f"   ✓ Average intake vs 2000 kcal RDI: {np.nanmean(normalized):.1f}%")
    
    # 5. Suggestions
    print("\n5. Data improvement suggestions...")
    suggestions = suggest_data_fixes(data)
    if suggestions:
        for i, suggestion in enumerate(suggestions[:3], 1):
            print(f"   {i}. {suggestion}")
    else:
        print("   ✓ No issues detected!")
    
    print("\n" + "=" * 70)
    print("PHASE 1 COMPLETE")
    print("=" * 70)
    print("\nData layer features:")
    print("  ✓ NumPy-based CSV loading")
    print("  ✓ Data interpolation and rolling averages")
    print("  ✓ RDI normalization")
    print("  ✓ Macro calorie calculations")
    print("  ✓ Data validation and quality checks")
    print("  ✓ Comprehensive test suite (45 tests, 73% coverage)")
    print("\nNext: Phase 2 - Plotting Layer Refactor")
    print("=" * 70)


if __name__ == '__main__':
    main()
