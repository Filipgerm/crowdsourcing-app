# Python script to process CSV
python3 <<END_PYTHON

import csv

# Function to find missing entries
def find_missing_entries(csv_filename, prefix, count):
    # Read the CSV file
    with open(csv_filename, newline="") as csvfile:
        reader = csv.reader(csvfile)
        # Skip the header row
        next(reader)
        # Extract numbers from the first column based on the prefix
        numbers = {int(row[0].split("_")[1]) for row in reader if row[0].startswith(prefix)}

    # Find missing numbers
    missing_numbers = sorted(set(range(count)) - numbers)

    # Output the missing entries
    for missing_number in missing_numbers:
        print(f"{prefix}{missing_number}")

# Find missing English entries
find_missing_entries("mean_responses.csv", "english_", 350)

# Find missing Foreign entries
find_missing_entries("mean_responses.csv", "foreign_", 60)

END_PYTHON