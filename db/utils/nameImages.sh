#!/bin/bash

# Define source directories and the destination directory
source_english_dir="../../../website-aesthetics-datasets/rating-based-dataset/images/english"
source_foreign_dir="../../../website-aesthetics-datasets/rating-based-dataset/images/foreign"
websites_dir="../../../website-aesthetics-datasets/rating-based-dataset/images/websites1"

# Create the destination directory if it doesn't exist
mkdir -p "$websites_dir"

# Copy files from the english folder with the new naming scheme
for file in "$source_english_dir"/*.png; 
do
    filename=$(basename "$file")
    cp "$file" "$websites_dir/english_$filename"
done

# Copy files from the foreign folder with the new naming scheme
for file in "$source_foreign_dir"/*.png; 
do
    filename=$(basename "$file")
    cp "$file" "$websites_dir/foreign_$filename"
done

echo "Files copied successfully."
