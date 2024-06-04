#!/bin/bash

# MongoDB credentials
username="root"
password="example"
db_name="votes"

# CSV file path
input_filepath="../../../website-aesthetics-datasets/rating-based-dataset/data/ae_only_unambiguous_1000.csv" 
output_filepath='mean_responses.csv'

# Python script to process CSV
python3 <<END_PYTHON
import csv

input_filepath = "$input_filepath"
output_filepath = "$output_filepath"

# Dictionary to store mean responses for 'english' and 'foreign' websites
english_sum = {}
english_count = {}
foreign_sum = {}
foreign_count = {}

# Read CSV file and calculate mean responses
with open(input_filepath, newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        website = row['website']
        mean_response = float(row['mean_response'])  # Assuming mean_response is a float value

        if 'english' in website:
            english_sum[website] = english_sum.get(website, 0) + mean_response
            english_count[website] = english_count.get(website, 0) + 1
        elif 'foreign' in website:
            foreign_sum[website] = foreign_sum.get(website, 0) + mean_response
            foreign_count[website] = foreign_count.get(website, 0) + 1

# Calculate mean for each group
english_means = {k: v / english_count[k] for k, v in english_sum.items()}
foreign_means = {k: v / foreign_count[k] for k, v in foreign_sum.items()}

# Write results to CSV
with open(output_filepath, 'w', newline='') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(['website', 'mean_response'])
    for website, mean_response in english_means.items():
        writer.writerow([website, mean_response])
    for website, mean_response in foreign_means.items():
        writer.writerow([website, mean_response])
END_PYTHON


# # Function to create the images collection if it doesn't exist
# create_images_collection() {
#     local username="$1"
#     local password="$2"
#     local db_name="$3"
#     # Execute MongoDB command to create the collection if it doesn't exist
#     mongosh -u "$username" -p "$password" --authenticationDatabase admin --eval "use $db_name; if (!db.images) { db.createCollection('images') }"
# }

# # Create the images collection if it doesn't exist
# create_images_collection "$username" "$password" "$db_name"



# Function to insert data into MongoDB
insert_into_mongodb() {
    local website="$1"
    local average_rating="$2"
    local db_name="$3"
    local username="$4"
    local password="$5"

    echo "Inserting into MongoDB: website='$website', averageRating=$average_rating, db_name=$db_name"

    # Execute MongoDB insert command
    mongosh -u "$username" -p "$password" --authenticationDatabase admin <<EOF
use $db_name
db.images.insertOne({ _id: $image_id, website: '$website', averageRating: $average_rating })
EOF
}




# Read CSV file and insert data into MongoDB
image_id=1
tail -n +2 "$output_filepath" | while IFS=, read -r website mean_response; do
    # echo "Processing: website='$website', mean_response='$mean_response', db_name=$db_name"
    insert_into_mongodb "$website" "$mean_response" "$db_name" "$username" "$password"
    image_id=$((image_id + 1))
done



