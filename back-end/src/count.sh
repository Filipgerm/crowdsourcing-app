#!/bin/bash

# Specify the CSV file
csv_file="mean_responses.csv"

# Read the contents of the CSV file, skipping the first line (header)
content=$(tail -n +2 "$csv_file")

# Remove any spaces (optional)
clean_content=$(echo "$content" | tr -d ' ')

# Extract only the values (assuming values are in the second column)
values=$(echo "$clean_content" | cut -d ',' -f2)

# Count the number of values
value_count=$(echo "$values" | wc -l)

# Print the number of values
echo "Number of values: $value_count"

