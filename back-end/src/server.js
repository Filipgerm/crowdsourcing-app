const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const cors = require('cors')
const voteRoutes = express.Router()
const VoteSession = require('./models/voteSession.js')
const Comparison = require('./models/comparison.js')
const Image = require('./models/image.js')

const PORT = process.env.PORT || 4000
const mongoURI = process.env.MONGO_URI || "mongo:27017/admin?authSource=admin"

// number of compariΣsons that will be displayed in a vote session
const numberOfComparisons = parseInt(process.env.VOTING_ROUNDS) || 8

// time limit for each voting round (in seconds)
const timeLimitOfEachComparison = parseInt(process.env.VOTING_TIME) || 8

// number of comparisons that are used for answer quality control
const answerQualityControls = 2

app.use(cors())
app.use(bodyParser.json())

// Make Mongoose use `findOneAndUpdate()`. Note that this option is `true`
// by default, you need to set it to false.
mongoose.set('useFindAndModify', false)

// establish connection to the database
mongoose.connect(mongoURI, { useNewUrlParser: true })
  .then(() => {
   // console.log('Database connection successful', mongoURI)
   console.log('Database connection successful');
  })
  .catch((err) => {
    // console.error('Database connection error',mongoURI)
    console.error('Database connection error');
    console.error(err)
  })


 // Assuming `images` is your sorted array of images
function pickImages(images, numPairs) {
  let pairs = [];

  for (let i = 0; i < numPairs; i++) {
    // Pick a random index for the first image
    let index1 = Math.floor(Math.random() * images.length);

    // Pick a second index near the first one with weighted probability
    let index2 = pickIndexNear(index1, images.length);

    pairs.push([images[index1], images[index2]]);


  return pairs;
}


// Function to pick an index near the specified index with weighted probability
function pickIndexNear(index, arrayLength) {
  // Define the standard deviation of the Gaussian distribution
  let stdDev = 40;

  // Generate a random number from a Gaussian distribution centered at the specified index
  let randomOffset = Math.round(randn_bm() * stdDev);

  // Ensure the second index is within the array bounds
  let index2 = Math.max(0, Math.min(arrayLength - 1, index + randomOffset));

  return index2;
}

// Standard Normal variate using Box-Muller transform.
function randn_bm() {
  var u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
} 

// generate a random integer number between [low, high)
function randomInteger(low, high) {
  return Math.floor(Math.random() * (high - low) + low)
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}


function BradleyTerryScores(comparisons) {
  const epsilon = 0.0001; // convergence threshold
  let scores = {}; // initialize scores

  // Initialize scores to 1
  for (let comparison of comparisons) {
    scores[comparison.im1] = 1;
    scores[comparison.im2] = 1;
  }

  let maxDiff;

  do {
    let newScores = {};
    let totalScore = 0;

    // Calculate new scores
    for (let comparison of comparisons) {
      let winScore = comparison.w1;
      let loseScore = comparison.w2;
      newScores[comparison.im1] = winScore / (winScore + loseScore);
      newScores[comparison.im2] = loseScore / (winScore + loseScore);
      totalScore += newScores[comparison.im1] + newScores[comparison.im2];
    }

    maxDiff = 0;

    // Normalize scores and check for convergence
    for (let imageId in scores) {
      newScores[imageId] /= totalScore;
      let diff = Math.abs(newScores[imageId] - scores[imageId]);
      if (diff > maxDiff) {
        maxDiff = diff;
      }
    }

    scores = newScores;
  } while (maxDiff > epsilon);

  return scores;
}

// start new vote session
voteRoutes.route('/start_session').post((req, res) => {
  const numberOfComparisonsToSelect =
    numberOfComparisons - answerQualityControls

  // Fetch and sort images from the database
  Image.find().sort({ averageRating: 1 }).then(images => {
    let pickedImages = pickImages(images, numberOfComparisonsToSelect);
    // console.log(pickedImages);

    // determine randomly the position (left or right) that images will
    // be displayed
    let imageLeftIds = [];
    let imageRightIds = [];

    pickedImages.forEach((imagePair, index) => {
        // Shuffle the images in the pair
      let shuffledPair = shuffleArray([...imagePair]);
      
      imageLeftIds.push(shuffledPair[0].imageID);
      imageRightIds.push(shuffledPair[1].imageID);
    });

    // add the answer quality control comparisons. These comparisons
    // are selected randomly from imageLeftIds and imageRightIds arrays
    let answerControlIndex1 = numberOfComparisons / answerQualityControls - 1;
    let answerControlIndex2 = numberOfComparisons - 1;

    let controlComparisonIndex1 = randomInteger(0, answerControlIndex1 - 1);
    let controlComparisonIndex2 = randomInteger(answerControlIndex1 + 1, answerControlIndex2 - 1);

    imageLeftIds.splice(answerControlIndex1, 0, imageRightIds[controlComparisonIndex1]);
    imageRightIds.splice(answerControlIndex1, 0, imageLeftIds[controlComparisonIndex1]);

    imageLeftIds.splice(answerControlIndex2, 0, imageRightIds[controlComparisonIndex2]);
    imageRightIds.splice(answerControlIndex2, 0, imageLeftIds[controlComparisonIndex2]);


    // Create the vote session with the picked images
    let voteSession = new VoteSession({
      d: new Date(),
      vot: pickedImages.map((imagePair, index) => ({
        imL: imageLeftIds[index], 
        imR: imageRightIds[index], 
        imC: null  // initially, no image is chosen
      }))
    });

    voteSession.save().then(() => {    
      // Mark the comparisons as "used"
      imageLeftIds.forEach((imageId, index) => {
        // Find the comparison that corresponds to the pair of images
        Comparison.findOne({$or: [{im1: imageId, im2: imageRightIds[index]},
           {im1: imageRightIds[index], im2: imageId}]}, (err, doc) => {

          if (err) {
            console.log('Error occurred while finding the comparison: ' + err);
          } else if (doc) {
            // Update the comparison
            Comparison.updateOne({"_id" : doc._id}, {$set : {"u" : true}}, (err) => {
              if (err) {
                console.log('Error occurred while updating the comparison: ' + err)
              }
    
              // timeout time in milliseconds
              const timeoutTime = (numberOfComparisons+1) * timeLimitOfEachComparison * 1000 + 2000
    
              setTimeout(() => {
                Comparison.updateOne({"_id" : doc._id}, {$set : {"u" : false}}, (err) => {
                  if (err) {
                    console.log('Error occurred while updating the comparison: ' + err)
                  }
                })
              }, timeoutTime)
            })
            
            res.status(200).send({
              '_id': voteSession.id,
              'imageLeftIds': imageLeftIds,
              'imageRightIds': imageRightIds
            });

          console.log('\nNew vote session started: ' + voteSession.id);
          }
        })

      });
      
    }).catch(err => {
      console.error('Error occurred while saving the vote session: ' + err);
    });

  }).catch(err => {
    res.status(400).send('Failed to add new voteSession')
    console.log('Failed to start new vote session')
    console.log(err)
  })

})

// add vote to vote session
voteRoutes.route('/add/:id').post((req, res) => {
  let _id = req.params.id

  // find the current vote session and add the result of a comparison
  VoteSession.findOneAndUpdate({ "_id" : _id }, { $push: {vot: req.body}}, (err, doc) => {
    if (err) {
      res.status(400).send(err)
      console.log('Failed to add vote to vote session: ' + _id)
      console.log('Error message: ' + err)
    }
    else{
      res.status(200).send('Vote added successfully: ' + _id)
      console.log('Vote added successfully: ' + _id)
    }
  })
})

// check if the vote session passes the answer quality control
function checkIfVoteSessionIsAccepted(votes) {

  // get the answer quality control comparisons
  let answerControlIndex1 = numberOfComparisons / answerQualityControls - 1
  let answerControlIndex2 = numberOfComparisons - 1

  let votesSegment1 = votes.slice(0, answerControlIndex1)
  let votesSegment2 = votes.slice(answerControlIndex1 + 1, answerControlIndex2)

  let controlVote1 = votes[answerControlIndex1]
  let controlVote2 = votes[answerControlIndex2]

  // check if the user gave correct answer to the control comparisons
  let answerIsAccepted1 = false
  for (let index = 0; index < votesSegment1.length; index++) {
    if (votesSegment1[index].imL === controlVote1.imR
      && votesSegment1[index].imR === controlVote1.imL)
    {
      answerIsAccepted1 = (votesSegment1[index].imC === controlVote1.imC)
      break
    }
  }

  let answerIsAccepted2 = false
  for (let index = 0; index < votesSegment2.length; index++) {
    if (votesSegment2[index].imL === controlVote2.imR
      && votesSegment2[index].imR === controlVote2.imL)
    {
      answerIsAccepted2 = (votesSegment2[index].imC === controlVote2.imC)
      break
    }
  }

  // the vote session is accepted only if all the control comparisons
  // were answered correctly
  return (answerIsAccepted1 && answerIsAccepted2)
}

// remove the answer quality control comparisons from the votes array
function removeControlComparisons(votes) {
  let answerControlIndex1 = numberOfComparisons / answerQualityControls - 1
  let answerControlIndex2 = numberOfComparisons - 1

  votes.splice(answerControlIndex1, 1)
  votes.splice(answerControlIndex2-1, 1)

  return votes
}

// process the votes of the user when the vote session is complete
voteRoutes.route('/submit/:id').post((req, res) => {
  let _id = req.params.id

  // get the votes of the vote session
  VoteSession.findOne({ "_id" : _id }, (err, doc) => {
    if (err) {
      res.status(400).send(err)
      console.log('Failed to find vote session for submission: ' + _id)
    }
    else {
      let votes = doc.vot

      // check if the vote session passes the answer quality control
      if (checkIfVoteSessionIsAccepted(votes))
      {
        // mark the vote session as "accepted"
        VoteSession.findOneAndUpdate({ "_id" : _id }, { $set: {acc: true}}, (err, doc) => {
          if (err) {
            res.status(400).send(err)
            console.log('Failed to accept vote session: ' + _id)
            console.log('Error message: ' + err)
          }
          else{
            console.log('Accepted vote session successfully: ' + _id)
          }
        })

        // remove the answer quality control comparisons
        votes = removeControlComparisons(votes)

        // update the comparisons collection with the results of the vote session
        for (let index = 0; index < votes.length; index++) {
          let vote = votes[index]

          // if the user did not choose an image during a voting round,
          // a timeout occurred. In this case, the comparisons collection is
          // not updated for this particular comparison
          if (vote.imC !== -1) {
            let rowId, columnId
            if (vote.imL > vote.imR) {
              rowId = vote.imL
              columnId = vote.imR
            }
            else {
              rowId = vote.imR
              columnId = vote.imL
            }

            let imageWonPropertyName = (rowId === vote.imC) ? "w1" : "w2"

            Comparison.findOneAndUpdate(
              { "im1" : rowId, "im2" : columnId },
              {
                $inc : {
                  [imageWonPropertyName] : 1,
                  "t" : 1
                }
              },
              (err, doc) => {
                if (err) {
                  console.log(`Error while updating comparison table (index ${index}): ` + _id)
                  res.status(400).send(err)
                }
                else {
                  console.log(`Comparison table updated successfully (index ${index}): ` + _id)
                }
              }
            )
          }
        }
        res.status(200).send('Vote session was processed successfully: ' + _id)
      }
      else {
        res.status(200).send('Vote session was not accepted: ' + _id)
        console.log('Vote session was not accepted: ' + _id)
      }
    }
  })

})


app.use('/votes', voteRoutes)

app.listen(PORT, () => {
  console.log('Server is running on port: ' + PORT)
})}
