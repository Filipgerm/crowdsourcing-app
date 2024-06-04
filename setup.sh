#! /bin/bash

if [ ! -f .env ]; then
  echo ".env does not exist"
  exit 1
fi

sudo docker-compose -f docker-compose.yml up -d --build

for i in "$@"
do
argument="$i"
case $argument in
  --create)
    echo "*** Creating comparison pairs with a random order ***"
    sudo docker exec -w /data/utils server node createComparisonData.js
    ;;
  --sortimages)
    echo "*** Sorting images ***"
    cd front-end/public/images
    ls
    num=0
    for file in *.png; do
       mv "$file" "$(printf "%u" $num).png"
       num=$((num + 1))
    done
    cd ../../..
    ;;
  --restore=*)
    restore=true
    BACKUPPATH="${i#*=}"
    shift
    ;;
esac
done

sudo docker exec -w /data/utils mongo ./createVotesDB.sh

if [ "$restore" = true ] ; then
    echo "*** Restoring database content from backup ***"
    echo "PATH IN BACKUP FOLDER = ${BACKUPPATH}"
    BACKUPPATH="../backup/${BACKUPPATH}"
    docker exec -w /data/utils mongo ./restoreVotesDB.sh ${BACKUPPATH}
fi

sudo docker-compose down

echo
echo "****************************"
echo "Setup Completed Successfully"
