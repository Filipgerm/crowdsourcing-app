#!/bin/bash

input_dir="images"
output_dir="resized_images"

# Create output directory if it doesn't exist
mkdir -p $output_dir

# Loop through all PNG files in the input directory
for img in $input_dir/*.png; do
    # Get the base name of the file
    base_name=$(basename $img)
    # Resize the image and save it in the output directory
    convert $img -resize 256x192 $output_dir/$base_name
done

echo "Resizing completed."
