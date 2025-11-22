# Google Sheets Integration Guide

This guide explains how to configure the nutritional app to load data from Google Sheets instead of local CSV files.

## Why Google Sheets?

Using Google Sheets as your data source provides several benefits:
- **Real-time updates**: Changes in the sheet are immediately available to the app
- **Collaborative editing**: Multiple people can update the data
- **Cloud backup**: Your data is safely stored in Google Drive
- **Mobile editing**: Update your nutrition data from your phone
- **Automatic sync**: No need to manually download/upload CSV files

## Setup Instructions

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Note the project ID for later

### Step 2: Enable Required APIs

1. In your Google Cloud project, go to "APIs & Services" > "Enable APIs and Services"
2. Search for and enable:
   - **Google Sheets API**
   - **Google Drive API**

### Step 3: Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the details:
   - **Service account name**: `nutritional-app` (or your preferred name)
   - **Service account ID**: Will be auto-generated
   - **Description**: "Service account for nutritional app data access"
4. Click "Create and Continue"
5. Skip the optional steps (no roles needed for private sheets)
6. Click "Done"

### Step 4: Download Service Account Credentials

1. On the "Credentials" page, find your new service account in the list
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" format
6. Click "Create"
7. The JSON key file will download to your computer
8. **Important**: Keep this file secure! It provides access to your Google account

### Step 5: Save Credentials File

1. Rename the downloaded file to something memorable (e.g., `google_service_account.json`)
2. Move it to the `credentials/` folder in your nutritional project:
   ```
   nutritional/
   ├── credentials/
   │   └── google_service_account.json  ← Place here
   ```
3. The file will be automatically excluded from git (for security)

### Step 6: Share Your Google Sheet

1. Open your nutritional data Google Sheet
2. Click the "Share" button
3. Copy the service account email address from the JSON file:
   - Open `credentials/google_service_account.json`
   - Find the `"client_email"` field
   - It looks like: `nutritional-app@your-project.iam.gserviceaccount.com`
4. Paste this email in the "Share with people and groups" field
5. Set permission to "Viewer" (read-only) or "Editor" if you want the app to write back
6. Uncheck "Notify people" (the service account doesn't read emails)
7. Click "Share"

### Step 7: Get Your Spreadsheet ID

The spreadsheet ID is in the URL of your Google Sheet:

```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
                                      ↑
                                      This is your spreadsheet ID
```

Copy everything between `/d/` and `/edit`.

### Step 8: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and update:
   ```bash
   GOOGLE_SHEETS_ID=your_actual_spreadsheet_id_here
   GOOGLE_CREDENTIALS_PATH=credentials/google_service_account.json
   LOCAL_CSV_PATH=local_data/Food - Daily.csv  # Fallback
   ```

3. Save the file

**Note**: The `.env` file is automatically loaded when the app starts. You don't need to export variables manually or source the file.

### Step 9: Test the Connection

Run the app and check the console output:

```bash
uv run python -m nutritional
```

You should see:
```
Loading data from Google Sheets: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
Dash is running on http://127.0.0.1:8050/
```

If you see "Failed to load from Google Sheets", check the error message and troubleshooting section below.

## Google Sheet Format

Your Google Sheet should have the same structure as the CSV format:

### Required Columns
- `Date` (YYYY-MM-DD format, e.g., 2025-11-22)
- `Energy kcal` (numeric)
- `Protein g` (numeric)
- `Carbohydrates g` (numeric)
- `Fat g` (numeric)
- `Saturated Fat g` (numeric)
- `Weight Kg (Morning)` (numeric)
- `Weight Kg (Evening)` (numeric)

### Optional Columns (for nutrients plot)
- `Sugar g`
- `Fibre g`
- `Salt g`
- `Calcium mg`

### Example Sheet Structure

| Date       | Energy kcal | Protein g | Carbohydrates g | Fat g | Saturated Fat g | Weight Kg (Morning) | Weight Kg (Evening) |
|------------|-------------|-----------|-----------------|-------|-----------------|---------------------|---------------------|
| 2025-11-01 | 2000        | 150       | 200             | 70    | 20              | 75.0                | 75.5                |
| 2025-11-02 | 2100        | 160       | 210             | 75    | 22              | 74.9                | 75.4                |
| 2025-11-03 | 1900        | 140       | 190             | 65    | 18              | 74.8                | 75.3                |

## Troubleshooting

### Error: "Credentials file not found"
- Check that the JSON file is in the `credentials/` folder
- Verify the path in your `.env` file is correct
- Make sure the filename matches exactly (case-sensitive)

### Error: "Access denied to spreadsheet"
- Verify you shared the sheet with the service account email
- Check the email address in the JSON file's `client_email` field
- Make sure you clicked "Share" (not just copied the link)
- Wait a few minutes for permissions to propagate

### Error: "Spreadsheet not found"
- Double-check the spreadsheet ID in your `.env` file
- Make sure you copied the ID from the URL correctly (between `/d/` and `/edit`)
- Verify the sheet hasn't been deleted or moved

### Error: "Sheet must have a 'Date' column"
- Check that your first row contains a column exactly named `Date`
- Make sure there are no extra spaces or special characters
- Column names are case-sensitive

### App falls back to CSV
If you see "Failed to load from Google Sheets: ..." followed by "Falling back to local CSV...", it means:
1. Google Sheets configuration is present but not working
2. The app is using the local CSV as a backup
3. Check the error message for specific details

## Data Privacy & Security

### Best Practices
1. **Never commit** your service account JSON file to git
2. **Don't share** your service account credentials publicly
3. **Use Viewer permission** if you only need read access
4. **Rotate credentials** periodically for security
5. **Delete old service accounts** you're not using

### What the Service Account Can Access
The service account can only access:
- Google Sheets that have been explicitly shared with it
- Nothing else in your Google account

It's much safer than using your personal credentials!

### Revoking Access
To revoke access:
1. Open the Google Sheet
2. Click "Share"
3. Find the service account email
4. Click the X to remove access

## Advanced Configuration

### Custom Sheet Range
By default, the app reads all columns (A:Z). To specify a custom range:

```python
from nutritional.data.loaders import load_from_google_sheets

data = load_from_google_sheets(
    spreadsheet_id="your_id",
    range_name="Sheet1!A1:H100",  # Custom range
    credentials_path="credentials/google_service_account.json"
)
```

### Multiple Sheets
If your spreadsheet has multiple sheets (tabs), specify the sheet name:

```python
data = load_from_google_sheets(
    spreadsheet_id="your_id",
    range_name="November 2025!A:Z",  # Specific sheet tab
)
```

### Programmatic Sheet Selection
You can check available sheets:

```python
from nutritional.data.google_sheets import GoogleSheetsClient

client = GoogleSheetsClient("credentials/google_service_account.json")
info = client.get_spreadsheet_info("your_spreadsheet_id")

print(f"Title: {info['title']}")
print(f"Sheets: {info['sheets']}")
print(f"URL: {info['url']}")
```

## API Rate Limits

Google Sheets API has rate limits:
- **Read requests**: 60 per minute per user
- **Write requests**: 60 per minute per user

The nutritional app:
- Fetches data once on startup
- Fetches again when you click "Refresh"
- Caches data in the browser
- Should stay well under limits for personal use

If you hit rate limits, you'll see an HTTP 429 error. Just wait a minute and try again.

## Cost

- **Google Sheets API**: Free for personal use
- **Google Drive API**: Free for personal use
- **Google Cloud Project**: Free tier includes all you need

There are no costs for typical personal use of this app!

## Support

If you encounter issues:
1. Check this guide thoroughly
2. Verify each setup step carefully
3. Look at the console error messages
4. Check the [Google Sheets API documentation](https://developers.google.com/sheets/api)
5. File an issue on the project GitHub

## Example Complete Setup

Here's a complete example `.env` file:

```bash
# Real values (replace with yours)
GOOGLE_SHEETS_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
GOOGLE_CREDENTIALS_PATH=credentials/google_service_account.json

# Fallback
LOCAL_CSV_PATH=local_data/Food - Daily.csv

# App settings
DASH_DEBUG=True
DASH_HOST=0.0.0.0
DASH_PORT=8050
```

And that's it! Your app will now load data from Google Sheets automatically. 🎉
