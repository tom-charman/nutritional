import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
import sys
import argparse
from pathlib import Path
from .settings import (
    RDI_GUIDELINES,
    COLOR_PALETTE,
    CAL_CARB,
    CAL_PROT,
    CAL_FAT,
    ROLLING_WINDOW_DAYS,
)
from .data_handling import load_and_prepare_data, check_columns

def plot_calories_and_weight(df, plots_dir, full_date_range):
    """
    Plots the interpolated rolling average of calories, morning weight, and
    evening weight on a single, dual-axis chart to show correlation.
    """
    cols = ["Energy kcal", "Weight Kg (Morning)", "Weight Kg (Evening)"]
    if not check_columns(df, cols):
        return

    # 1. Resample, Interpolate, and calculate Rolling Averages
    # dropna() is appropriate here to ensure both calories and weights have
    # corresponding rolling values for the dual-axis plot synchronization.
    calories_interp = df[cols[0]].resample("D").asfreq().interpolate(method="linear")
    calories_avg = calories_interp.rolling(window=ROLLING_WINDOW_DAYS).mean().dropna()

    weight_m_interp = df[cols[1]].resample("D").asfreq().interpolate(method="linear")
    weight_m_avg = weight_m_interp.rolling(window=ROLLING_WINDOW_DAYS).mean().dropna()

    weight_e_interp = df[cols[2]].resample("D").asfreq().interpolate(method="linear")
    weight_e_avg = weight_e_interp.rolling(window=ROLLING_WINDOW_DAYS).mean().dropna()

    # 2. Set up the figure and the first axis
    fig, ax1 = plt.subplots(figsize=(14, 7))

    # --- AXIS 1: CALORIES ---
    color1 = COLOR_PALETTE["deep_blue"]
    ax1.set_xlabel("Date", fontsize=14)
    ax1.set_ylabel(
        f"Calories ({ROLLING_WINDOW_DAYS}-day avg)",
        color="black",
        fontsize=14,
        labelpad=10,
    )
    line1 = ax1.plot(
        calories_avg.index,
        calories_avg,
        color=color1,
        linewidth=3.0,
        label=f"Calories ({ROLLING_WINDOW_DAYS}-day avg)",
    )
    ax1.tick_params(axis="y", labelcolor="black", labelsize=12)

    # Set left Y-axis to be "zoomed in"
    min_cal = calories_avg.min()
    max_cal = calories_avg.max()
    padding_cal = (max_cal - min_cal) * 0.1
    if padding_cal < 50:
        padding_cal = 50
    ax1.set_ylim(min_cal - padding_cal, max_cal + padding_cal)

    # 4. Create the second axis (ax2) sharing the x-axis
    ax2 = ax1.twinx()

    # --- AXIS 2: WEIGHT ---
    color2 = COLOR_PALETTE["vibrant_pink"]
    color3 = COLOR_PALETTE["rich_purple"]

    ax2.set_ylabel(
        f"Weight (Kg) ({ROLLING_WINDOW_DAYS}-day avg)",
        color="black",
        fontsize=14,
        labelpad=10,
    )

    line2 = ax2.plot(
        weight_m_avg.index,
        weight_m_avg,
        color=color2,
        linewidth=3.0,
        label=f"Morning Weight ({ROLLING_WINDOW_DAYS}-day avg)",
    )
    line3 = ax2.plot(
        weight_e_avg.index,
        weight_e_avg,
        color=color3,
        linewidth=2.0,
        linestyle="--",
        label=f"Evening Weight ({ROLLING_WINDOW_DAYS}-day avg)",
    )

    ax2.tick_params(axis="y", labelcolor="black", labelsize=12)

    # Set right Y-axis to be "zoomed in" to encompass both
    min_w_m = weight_m_avg.min() if not weight_m_avg.empty else float("inf")
    min_w_e = weight_e_avg.min() if not weight_e_avg.empty else float("inf")
    min_w_avg = min(min_w_m, min_w_e)

    max_w_m = weight_m_avg.max() if not weight_m_avg.empty else float("-inf")
    max_w_e = weight_e_avg.max() if not weight_e_avg.empty else float("-inf")
    max_w_avg = max(max_w_m, max_w_e)

    # Only set limits if we have valid data
    if min_w_avg != float("inf") and max_w_avg != float("-inf"):
        padding_w = (max_w_avg - min_w_avg) * 0.1
        if padding_w < 0.5:
            padding_w = 0.5
        ax2.set_ylim(min_w_avg - padding_w, max_w_avg + padding_w)

    # 6. Combine the legends from all axes
    lines = line1 + line2 + line3
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc="upper left", fontsize=12, frameon=False)

    # 7. Format x-axis
    # Ensure all plots use the full date range
    ax1.set_xlim(full_date_range[0], full_date_range[1])

    # Use Month Name and Year format
    date_formatter = mdates.DateFormatter("%B %Y")
    ax1.xaxis.set_major_formatter(date_formatter)
    ax1.xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45, ha="right")

    fig.tight_layout()
    plt.savefig(plots_dir / "calories_vs_weight.pdf", dpi=300)
    plt.close()
    print(f"Saved '{plots_dir / 'calories_vs_weight.pdf'}'")


def plot_macros_stacked(df, plots_dir, full_date_range):
    """
    Plots the main macronutrients (Protein, Carbs, Fat) as a
    stacked area chart showing the CALORIC CONTRIBUTION of each macro,
    ensuring the total stack height matches the actual 'Energy kcal'.
    """
    # NOTE: 'Energy kcal' is required for the ratio calculation
    cols = ["Protein g", "Carbohydrates g", "Fat g", "Saturated Fat g", "Energy kcal"]
    if not check_columns(df, cols):
        return

    plt.figure(figsize=(14, 7))

    df_macros = df.copy()

    # 1. Calculate Other Fat (Total Fat - Saturated Fat)
    df_macros["Other Fat g"] = (df_macros["Fat g"] - df_macros["Saturated Fat g"]).clip(
        lower=0
    )

    # 2. Calculate POTENTIAL Calories (grams * factor)
    df_macros["Potential Protein Cal"] = df_macros["Protein g"] * CAL_PROT
    df_macros["Potential Carbs Cal"] = df_macros["Carbohydrates g"] * CAL_CARB
    df_macros["Potential Saturated Fat Cal"] = df_macros["Saturated Fat g"] * CAL_FAT
    df_macros["Potential Other Fat Cal"] = df_macros["Other Fat g"] * CAL_FAT

    potential_cal_cols = [
        "Potential Protein Cal",
        "Potential Carbs Cal",
        "Potential Saturated Fat Cal",
        "Potential Other Fat Cal",
    ]

    # 3. Calculate the total potential calories from the measured grams
    df_macros["Total Potential Cal"] = df_macros[potential_cal_cols].sum(axis=1)

    # 4. Calculate the Adjustment Factor: Actual Calories / Potential Calories
    df_macros["Adjustment Factor"] = df_macros["Energy kcal"] / df_macros[
        "Total Potential Cal"
    ].replace(0, 1)
    df_macros["Adjustment Factor"] = (
        df_macros["Adjustment Factor"]
        .fillna(1)
        .replace([float("inf"), float("-inf")], 1)
    )

    # 5. Calculate FINAL Adjusted Calories
    df_macros["Protein Cal"] = (
        df_macros["Potential Protein Cal"] * df_macros["Adjustment Factor"]
    )
    df_macros["Carbs Cal"] = (
        df_macros["Potential Carbs Cal"] * df_macros["Adjustment Factor"]
    )
    df_macros["Saturated Fat Cal"] = (
        df_macros["Potential Saturated Fat Cal"] * df_macros["Adjustment Factor"]
    )
    df_macros["Other Fat Cal"] = (
        df_macros["Potential Other Fat Cal"] * df_macros["Adjustment Factor"]
    )

    # 6. Resample, Interpolate, and calculate Rolling Average
    plot_cal_cols = ["Protein Cal", "Carbs Cal", "Saturated Fat Cal", "Other Fat Cal"]
    df_interp = (
        df_macros[plot_cal_cols].resample("D").asfreq().interpolate(method="linear")
    )
    df_rolling = (
        df_interp.rolling(window=ROLLING_WINDOW_DAYS).mean().dropna()
    )  # dropna() is fine here as it's a stacked plot

    # 7. Prepare data and colors for stackplot (consistent ordering)
    y_data = [
        df_rolling["Carbs Cal"],
        df_rolling["Protein Cal"],
        df_rolling["Other Fat Cal"],
        df_rolling["Saturated Fat Cal"],
    ]

    labels = [
        "Carbohydrates (kcal)",
        "Protein (kcal)",
        "Other Fat (kcal)",
        "Saturated Fat (kcal)",
    ]
    colors = [
        COLOR_PALETTE["warm_yellow"],
        COLOR_PALETTE["mint_green"],
        COLOR_PALETTE["rich_purple"],
        COLOR_PALETTE["vibrant_pink"],
    ]

    # 8. Create the stackplot
    plt.stackplot(df_rolling.index, *y_data, labels=labels, colors=colors, alpha=0.85)

    plt.ylabel("Total Calories (kcal)", fontsize=14)
    plt.xlabel("Date", fontsize=14)

    # 9. Must start Y-axis at 0
    plt.ylim(bottom=0)

    plt.legend(loc="upper left", fontsize=12, frameon=True, fancybox=True, shadow=True)

    # 10. Format x-axis
    plt.xlim(full_date_range[0], full_date_range[1])

    # Use Month Name and Year format
    date_formatter = mdates.DateFormatter("%B %Y")
    plt.gca().xaxis.set_major_formatter(date_formatter)
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45, ha="right")

    plt.tight_layout()
    plt.savefig(plots_dir / "macros_calorie_breakdown.pdf", dpi=300)
    plt.close()
    print(f"Saved '{plots_dir / 'macros_calorie_breakdown.pdf'}'")


def plot_normalized_nutrients(df, plots_dir, full_date_range):
    """
    Plots key nutrients (Saturated Fat, Sugar, Fibre, Salt, Calcium)
    normalized against their Recommended Daily Intake (RDI) target, all on one axis.

    FIX: Removed .dropna() after rolling mean calculation to ensure each individual
    nutrient line is plotted across its full valid date range.
    """
    # RDI Guidelines are pulled from the global dictionary
    cols = list(RDI_GUIDELINES.keys())
    if not check_columns(df, cols):
        return

    plt.figure(figsize=(14, 7))

    # 1. Resample and Interpolate the data
    df_interp = df[cols].resample("D").asfreq().interpolate(method="linear")

    # 2. Calculate Rolling Average *without* dropping NaNs.
    # This ensures the index spans the full interpolated range. Individual columns
    # will contain NaNs only where the rolling average cannot be computed (start of series).
    df_rolling = df_interp.rolling(window=ROLLING_WINDOW_DAYS).mean()

    df_normalized = pd.DataFrame(index=df_rolling.index)

    # Define color map for consistent colors
    color_map = {
        "Saturated Fat g": COLOR_PALETTE["vibrant_pink"],
        "Sugar g": COLOR_PALETTE["warm_yellow"],
        "Fibre g": COLOR_PALETTE["mint_green"],
        "Salt g": COLOR_PALETTE["deep_blue"],
        "Calcium mg": COLOR_PALETTE["rich_purple"],
    }

    # 3. Plot normalized lines (Value / RDI * 100)
    for col, rdi in RDI_GUIDELINES.items():
        if col in df_rolling.columns:
            # Calculate % RDI: (Value / RDI) * 100
            # Since df_rolling has NaNs where the rolling average isn't available,
            # df_normalized[col] will also have NaNs in the same places.
            df_normalized[col] = (df_rolling[col] / rdi) * 100

            # Clean up the label for the legend
            label = col.replace(" g", "").replace(" mg", "")
            # sns.lineplot automatically handles the NaNs, plotting the line only
            # where the data is valid, while the overall plot span is controlled by xlim.
            sns.lineplot(
                x=df_normalized.index,
                y=df_normalized[col],
                label=label,
                color=color_map.get(col, "gray"),
                linewidth=3.0,
            )

    plt.ylabel(f"Intake (% of RDI - {ROLLING_WINDOW_DAYS}-day avg)", fontsize=14)
    plt.xlabel("Date", fontsize=14)

    # 4. Draw a horizontal line at 100% (the RDI target)
    plt.axhline(
        100,
        color="red",
        linestyle="--",
        linewidth=1.5,
        alpha=0.7,
        label="100% RDI Target",
    )

    # Set Y-axis limits
    max_rdi = df_normalized.max().max() if not df_normalized.empty else 150
    plt.ylim(bottom=-10, top=max(150, max_rdi + 20))

    plt.legend(
        title="Nutrient",
        fontsize=12,
        title_fontsize=12,
        frameon=False,
        loc="upper left",
    )

    # 5. Format x-axis
    plt.xlim(full_date_range[0], full_date_range[1])

    # Use Month Name and Year format
    date_formatter = mdates.DateFormatter("%B %Y")
    plt.gca().xaxis.set_major_formatter(date_formatter)
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45, ha="right")

    plt.tight_layout()
    plt.savefig(plots_dir / "normalized_nutrients_rdi.pdf", dpi=300)
    plt.close()
    print(f"Saved '{plots_dir / 'normalized_nutrients_rdi.pdf'}'")
