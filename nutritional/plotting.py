import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import seaborn as sns
from .settings import (
    RDI_GUIDELINES,
    COLOR_PALETTE,
    CAL_CARB,
    CAL_PROT,
    CAL_FAT,
    ROLLING_WINDOW_DAYS,
)
from .data_handling import check_columns
import matplotlib.ticker as mticker


def plot_calories_and_weight(df, plots_dir, full_date_range):
    """
    Plots interpolated rolling averages of calories, morning weight, and
    evening weight on a dual-axis chart, ensuring:
    - Only left-axis gridlines
    - Perfectly aligned major ticks between axes
    - Calories ticks rounded to nearest 100
    - Weight ticks rounded to whole kg
    """
    cols = ["Energy kcal", "Weight Kg (Morning)", "Weight Kg (Evening)"]
    if not check_columns(df, cols):
        return

    # --- 1. Interpolation + Rolling Averages ---
    calories_avg = (
        df[cols[0]]
        .resample("D")
        .asfreq()
        .interpolate("linear")
        .rolling(window=ROLLING_WINDOW_DAYS)
        .mean()
        .dropna()
    )
    weight_m_avg = (
        df[cols[1]]
        .resample("D")
        .asfreq()
        .interpolate("linear")
        .rolling(window=ROLLING_WINDOW_DAYS)
        .mean()
        .dropna()
    )
    weight_e_avg = (
        df[cols[2]]
        .resample("D")
        .asfreq()
        .interpolate("linear")
        .rolling(window=ROLLING_WINDOW_DAYS)
        .mean()
        .dropna()
    )

    # Common index for the fill_between region
    common_index = weight_m_avg.index.intersection(weight_e_avg.index)
    wm = weight_m_avg.loc[common_index]
    we = weight_e_avg.loc[common_index]

    # --- 2. Figure / Axis Setup ---
    fig, ax1 = plt.subplots(figsize=(14, 7))

    color_cal = COLOR_PALETTE["deep_blue"]
    color_wt = COLOR_PALETTE["vibrant_pink"]

    # --- AXIS 1: CALORIES ---
    ax1.set_xlabel("Date", fontsize=14)
    ax1.set_ylabel(
        f"Calories ({ROLLING_WINDOW_DAYS}-day avg)", fontsize=14, color="black"
    )

    ax1.plot(
        calories_avg.index,
        calories_avg,
        color=color_cal,
        linewidth=3.0,
        label=f"Calories ({ROLLING_WINDOW_DAYS}-day avg)",
    )

    # --- CALORIES Y-AXIS LIMITS snapped to multiples of 100 ---
    cal_min = calories_avg.min()
    cal_max = calories_avg.max()
    pad = (cal_max - cal_min) * 0.1
    if pad < 50:
        pad = 50

    y1_min = (cal_min - pad) // 100 * 100
    y1_max = ((cal_max + pad + 99) // 100) * 100
    ax1.set_ylim(y1_min, y1_max)

    # Major ticks every 100 calories
    ax1.yaxis.set_major_locator(mticker.MultipleLocator(100))
    ax1.tick_params(labelsize=12)

    # Horizontal gridlines ONCE, from left axis only
    ax1.grid(True, axis="y", linestyle="--", alpha=0.35)

    # --- AXIS 2: WEIGHT ---
    ax2 = ax1.twinx()
    ax2.set_ylabel(
        f"Weight (Kg) ({ROLLING_WINDOW_DAYS}-day avg)", fontsize=14, color="black"
    )

    ax2.plot(
        weight_m_avg.index,
        weight_m_avg,
        color=color_wt,
        linewidth=2.0,
        linestyle="-.",
        label=f"Morning Weight ({ROLLING_WINDOW_DAYS}-day avg)",
    )

    ax2.plot(
        weight_e_avg.index,
        weight_e_avg,
        color=color_wt,
        linewidth=2.0,
        linestyle="--",
        label=f"Evening Weight ({ROLLING_WINDOW_DAYS}-day avg)",
    )

    # Weight range snapped to whole kg
    w_min = min(weight_m_avg.min(), weight_e_avg.min())
    w_max = max(weight_m_avg.max(), weight_e_avg.max())
    w_pad = max((w_max - w_min) * 0.1, 0.5)

    y2_min = int(np.floor(w_min - w_pad))
    y2_max = int(np.ceil(w_max + w_pad))

    ax2.set_ylim(y2_min, y2_max)

    # Major ticks every 1 kg
    ax2.yaxis.set_major_locator(mticker.MultipleLocator(1))
    ax2.tick_params(labelsize=12)

    # Match RIGHT axis tick positions to LEFT via the underlying grid
    ax2.yaxis.grid(False)  # no double gridlines
    ax2.set_yticks(ax2.get_yticks())  # forces alignment with ax1 gridlines

    # --- Fill between the two weight curves ---
    ax2.fill_between(
        common_index,
        wm,
        we,
        color=color_wt,
        alpha=0.1,
        label="Weight Range",
    )

    # --- LEGEND ---
    lines = ax1.get_lines() + ax2.get_lines()
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc="upper left", fontsize=12, frameon=False)

    # --- X AXIS formatting ---
    ax1.set_xlim(full_date_range[0], full_date_range[1])
    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%B %Y"))
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
