#! /bin/bash
# # set -e
# echo "Username: $MONGO_INITDB_ROOT_USERNAME"
# echo "Password: $MONGO_INITDB_ROOT_PASSWORD"
# echo "TESTTTTTT"

# mongo --host host.docker.internal --port 27017 --username adminUser --password adminPassword --authenticationDatabase admin<<EOF
# use votes
# EOF

# mongoimport --host host.docker.internal --port 27017 --db votes --collection comparisons --authenticationDatabase admin \
#   -u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD \
#   --file comparisons_data.json

# mongo --host host.docker.internal --port 27017 --authenticationDatabase admin -u $MONGO_INITDB_ROOT_USERNAME \
#   -p $MONGO_INITDB_ROOT_PASSWORD <<EOF
# use votes
# db.comparisons.createIndex({"t": 1})
# db.comparisons.createIndex({"u": 1})
# EOF

mongo <<EOF
use votes
EOF

mongoimport --db votes --collection comparisons --authenticationDatabase admin \
  -u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD \
  --file comparisons_data.json

mongo --authenticationDatabase admin -u $MONGO_INITDB_ROOT_USERNAME \
  -p $MONGO_INITDB_ROOT_PASSWORD <<EOF
use votes
db.comparisons.createIndex({"t": 1})
db.comparisons.createIndex({"u": 1})
EOF