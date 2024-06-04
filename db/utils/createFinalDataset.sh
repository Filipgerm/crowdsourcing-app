# Python script to process CSV and copy images
python3 <<END_PYTHON

import csv
import os
import shutil

# Function to copy images
def copy_images(csv_filename):
    # Define directories
    source_english_dir = "../../../website-aesthetics-datasets/rating-based-dataset/images/english"
    source_foreign_dir = "../../../website-aesthetics-datasets/rating-based-dataset/images/foreign"
    websites_dir = "../../../website-aesthetics-datasets/rating-based-dataset/images/websites"
    
    # Create the websites directory if it doesn't exist
    if not os.path.exists(websites_dir):
        os.makedirs(websites_dir)

    # Read the CSV file
    with open(csv_filename, newline="") as csvfile:
        reader = csv.reader(csvfile)
        # Skip the header row
        next(reader)
        
        # Initialize index
        index = 0
        
        # Loop through each row in the CSV
        for row in reader:
            # Extract entry name and image number
            entry_name = row[0]
            image_number = int(entry_name.split("_")[1])
            # Determine source directory based on entry name
            if entry_name.startswith("english_"):
                source_dir = source_english_dir
            elif entry_name.startswith("foreign_"):
                source_dir = source_foreign_dir
            else:
                continue  # Skip if entry doesn't start with expected prefix
            
            # Construct source and destination paths
            source_image_path = os.path.join(source_dir, f"{image_number}.png")
            destination_image_path = os.path.join(websites_dir, f"{index}.png")
            
            # Check if the source image file exists
            if not os.path.exists(source_image_path):
                print(f"Image file '{source_image_path}' not found in the CSV.")
                continue
            
            # Copy the image to the websites directory
            shutil.copy(source_image_path, destination_image_path)
            
            # Increment index
            index += 1

# Call the function to copy images
copy_images("mean_responses.csv")

END_PYTHON
