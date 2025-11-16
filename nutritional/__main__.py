import matplotlib.pyplot as plt
import seaborn as sns
import argparse
from pathlib import Path
from .data_handling import load_and_prepare_data
from .plotting import (
    plot_calories_and_weight,
    plot_macros_stacked,
    plot_normalized_nutrients,
)


def parse_arguments():
    """
    Sets up the argument parser to accept the input CSV file path.
    """
    parser = argparse.ArgumentParser(
        description="Visualize nutritional data and weight trends from a CSV file.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "filename",
        type=str,
        help="Path to the input CSV file (e.g., 'my_health_log.csv').",
    )
    return parser.parse_args()


def main():
    """
    Main function to run the data visualization process.
    """
    # 1. Parse arguments to get the file path
    args = parse_arguments()
    file_path = args.filename

    # --- GLOBAL STYLE SETTINGS for a polished, modern look ---
    sns.set_theme(style="whitegrid")

    # Custom matplotlib settings for clean aesthetics
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["figure.facecolor"] = "white"
    plt.rcParams["savefig.facecolor"] = "white"
    plt.rcParams["axes.edgecolor"] = "lightgray"
    plt.rcParams["axes.labelcolor"] = "dimgray"
    plt.rcParams["xtick.color"] = "gray"
    plt.rcParams["ytick.color"] = "gray"
    plt.rcParams["axes.spines.top"] = False  # Remove top border
    plt.rcParams["axes.spines.right"] = False  # Remove right border
    plt.rcParams["grid.color"] = "lightgray"  # Lighten grid lines
    plt.rcParams["grid.alpha"] = 0.6  # Make grid lines slightly transparent

    # Create the 'plots' directory using pathlib
    plots_dir = Path("plots")
    plots_dir.mkdir(exist_ok=True)
    print(f"Created directory: '{plots_dir}'")

    # Load and prepare data
    data = load_and_prepare_data(file_path)  # Uses the argument provided file_path

    if data is not None and not data.empty:
        # Determine the full date range for consistent x-axes
        full_date_range = (data.index.min(), data.index.max())

        # Generate all plots
        print("\nGenerating plots...")
        # Remaining plots: Correlation, Macro Breakdown, RDI Normalized
        # Pass the full_date_range to ensure axis consistency
        plot_calories_and_weight(data, plots_dir, full_date_range)
        plot_macros_stacked(data, plots_dir, full_date_range)
        plot_normalized_nutrients(data, plots_dir, full_date_range)

        print(
            f"\nAll plots generated and saved as .pdf files in the '{plots_dir}' directory."
        )
    elif data.empty:
        print("Data file was loaded but appears to be empty.")
    else:
        print("Failed to load data, exiting.")


if __name__ == "__main__":
    main()
