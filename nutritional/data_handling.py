import pandas as pd


def load_and_prepare_data(filepath):
    """
    Loads the CSV file, converts the 'Date' column, and sets it as the index.
    """
    try:
        # Read the CSV.
        try:
            df = pd.read_csv(filepath, parse_dates=["Date"])
        except (pd.errors.ParserError, ValueError):
            print("Auto-parsing date failed, trying with dayfirst=True...")
            df = pd.read_csv(filepath, parse_dates=["Date"], dayfirst=True)

        # Convert all data columns to numeric, just in case
        cols = df.columns.drop("Date")
        df[cols] = df[cols].apply(pd.to_numeric, errors="coerce")

        # Set the 'Date' as the index and sort it
        df = df.set_index("Date").sort_index()

        # Drop any rows where ALL data is missing
        df = df.dropna(how="all")

        print("Data loaded and prepared successfully.")
        print(f"Date range: {df.index.min().date()} to {df.index.max().date()}")
        return df

    except FileNotFoundError as e:
        raise e
    except Exception as e:
        raise e


def check_columns(df, cols):
    """Helper function to check if all required columns exist in the DataFrame."""
    missing = [col for col in cols if col not in df.columns]
    if missing:
        print(f"Warning: Missing required columns, skipping plot: {', '.join(missing)}")
        return False
    return True
