const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const cors = require('cors')
const voteRoutes = express.Router()
const VoteSession = require('./models/voteSession.js')
const Comparison = require('./models/comparison.js')
const Image = require('./models/image.js')
// const fmin = require('fmin');
// const numeric = require('numeric');


const axios = require('axios'); //library to make HTTP requests
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const PORT = process.env.PORT || 4000
const mongoURI = process.env.MONGO_URI || "mongo:27017/admin?authSource=admin"

// number of comparisons that will be displayed in a vote session
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
    //console.log('Database connection successful', mongoURI)
    console.log('Database connection successful');
  })
  .catch((err) => {
    // console.error('Database connection error',mongoURI)
    console.log('Database connection error');
    console.error(err)
  })


// Global variables to store initialized parameters
let initialParams = null;
const ratings = {};
let maxEnglishId = 0;
const ratingsFile = path.join(__dirname, 'mean_responses.csv');
  
// Function to initialize parameters
function initializeParameters() {
  return new Promise((resolve, reject) => {
    fs.createReadStream(ratingsFile)
      .pipe(csv())
      .on('data', (row) => {
        const [prefix, number] = row.website.split('_');
        const id = parseInt(number, 10);

        if (prefix === 'english') {
          ratings[id] = parseFloat(row.mean_response);
          if (id > maxEnglishId) {
            maxEnglishId = id;
          }
        } else if (prefix === 'foreign') {
          const foreignId = maxEnglishId + 1 + id; // Offset foreign IDs
          ratings[foreignId] = parseFloat(row.mean_response);
        }
      })
      .on('end', () => {
        console.log('CSV file successfully processed');
        initialParams = Object.keys(ratings).map(id => Math.log(ratings[id] || 1)); // Default to log(1) if no rating is found
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Call initializeParameters on server start
initializeParameters()
  .then(() => {
    console.log('Parameters initialized');
    // console.log('Initial parameters:', initialParams);
  })
  .catch(error => {
    console.error('Failed to initialize parameters:', error);
  });


// generate a random integer number between [low, high)
function randomInteger(low, high) {
  return Math.floor(Math.random() * (high - low) + low)
}


const optimizeBradleyTerry = async (initialParams, comparisons) => {
  try {
    const response = await axios.post('http://optimization:5000/optimize', {
      initialParams: initialParams,
      comparisons: comparisons
    });
    return response.data.optimal_params;
  } catch (error) {
    console.error('Error optimizing Bradley-Terry model:', error);
    throw error;
  }
};



const batchSize = 100; // Define the batch size
let currentBatchIndex = 12; // Use git logs to track Index 

// Function to get the next batch of comparisons
function getNextBatch(preparedComparisons, totalComparisons, batchSize, currentBatchIndex) {
  let batch = [];
  let start = currentBatchIndex * batchSize;
  // console.log("currentBatchIndex1", currentBatchIndex);
  
  while (batch.length < batchSize) {
    let end = start + batchSize - batch.length;

    if (end > totalComparisons) {
      end = totalComparisons;
    }

    batch = batch.concat(preparedComparisons.slice(start, end));

    console.log("batch", batch)
    console.log("start", start)
    console.log("end", end)

    if (batch.length < batchSize && end === totalComparisons) {
      start = 0; // Wrap around to the beginning
      currentBatchIndex = 0; // Reset the batch index to 0 when wrapping around
    }
    // } else {
    //   currentBatchIndex++;
    // }
  }
  // console.log("currentBatchIndex2", currentBatchIndex);
  

  return { batch, currentBatchIndex };
}

// Calculate L1 based on differences in Bradley-Terry strengths
const calculateL1 = (strength1, strength2) => {
  return 1 / (1 + Math.abs(strength1 - strength2));
};

// Calculate L2 based on the number of times a comparison has been displayed
const calculateL2 = (timesDisplayed) => {
  return 1 / (1 + timesDisplayed);
};

// Calculate the combined probability function L
const calculateL = (strength1, strength2, timesDisplayed) => {
  const L1 = calculateL1(strength1, strength2);
  const L2 = calculateL2(timesDisplayed);
  return Math.pow(L1, 0.2) * Math.pow(L2, 0.8);
};

// start new vote session
voteRoutes.route('/start_session').post(async (req, res) => {

  if (!initialParams) {
    return res.status(500).send('Parameters not initialized');
  }

  try {
    // // Set all "u" attributes to false before starting the new vote session
    // await Comparison.updateMany({ "u": true }, { $set: { "u": false } });
    // console.log('All comparisons reset to "u": false');





    // create a new document and save the time/date that
    // the vote session started
    let voteSession = new VoteSession(req.body);
    await voteSession.save();

    // select the comparisons that will be displayed in the vote session
    const numberOfComparisonsToSelect =
      numberOfComparisons - answerQualityControls


    const comparisons = await Comparison.find({ "u": false }).exec();
    if (!comparisons) {
      return res.status(400).send('Failed to select images');
    }

    // Extract unique image IDs
    const imageIds = [...new Set(comparisons.flatMap(comp => [comp.im1, comp.im2]))];

    const numImages = imageIds.length;

    // Map image IDs to indices for parameter array
    const imageIdToIndex = Object.fromEntries(imageIds.map((id, index) => [id, index])); //Node 12 or higher (e.g.14) required
    // const imageIdToIndex = imageIds.reduce((acc, id, index) => {
    //   acc[id] = index;
    //   return acc;
    // }, {});

    // Prepare data for optimization
    const preparedComparisons = comparisons.map(comp => ({
      im1: imageIdToIndex[comp.im1],
      im2: imageIdToIndex[comp.im2],
      w1: comp.w1 === 0 && comp.w2 === 0 ? 1 : comp.w1, // Ensure at least one win
      w2: comp.w1 === 0 && comp.w2 === 0 ? 1 : comp.w2  // Ensure at least one win
    }));


    // Update total number of comparisons
    const totalComparisons = preparedComparisons.length;

    // Get the next batch of comparisons
    const { batch: comparisonsBatch, currentBatchIndex: updatedBatchIndex } = getNextBatch(preparedComparisons,
     totalComparisons, batchSize, currentBatchIndex);

    // Update the currentBatchIndex for the next API call
    currentBatchIndex = updatedBatchIndex;

    console.log("currentBatchIndex", currentBatchIndex);


    // Log for debugging
    // console.log('Prepared comparisons:', preparedComparisons);
    // console.log('Initial parameters:', initialParams);
    

    //  const preparedComparisonsSubset = preparedComparisons.slice(0, 1000); // Use only the first 100 comparisons
    // const optimalParams = await optimizeBradleyTerry(initialParams, preparedComparisonsSubset);
    // Minimize the negative log-likelihood
    // const optimalParams = minimize(bradleyTerryLogLikelihood, initialParams, preparedComparisons);


    const optimalParams = await optimizeBradleyTerry(initialParams, comparisonsBatch);


    //console.log("optimalParams" , optimalParams);


    // Extract image strengths
    const imageStrengths = optimalParams.map(Math.exp);
    // const sumStrengths = numeric.sum(imageStrengths);
    const sumStrengths = imageStrengths.reduce((acc, val) => acc + val, 0);
    const normalizedStrengths = imageStrengths.map(s => s / sumStrengths);

    // Map indices back to image IDs
    const imageStrengthsDf = imageIds.map((id, i) => ({
      Image: id,
      Strength: normalizedStrengths[i]
    }));

    //console.log("Image Strengths:", imageStrengthsDf);

    // Calculate L for each pair
    let pairs = [];
    comparisons.forEach(comp => {
      const strength1 = normalizedStrengths[imageIdToIndex[comp.im1]];
      const strength2 = normalizedStrengths[imageIdToIndex[comp.im2]];
      const L = calculateL(strength1, strength2, comp.t);
      pairs.push({ im1: comp.im1, im2: comp.im2, L });
    });

    // Sort pairs by L in descending order (higher L means better comparison)
    pairs.sort((a, b) => b.L - a.L);

    // Select the number of comparisons defined in the .env file
    const selectedComparisons = pairs.slice(0, numberOfComparisonsToSelect);

    console.log("Selected Comparisons:", selectedComparisons);
    

  //REPLACE DOCS WITH selectedComparisons ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------
  // ------------------------*--------------------------


    // // Get the comparisons that have been displayed less
    // const selectedComparisons = await Comparison.find(
    //   { "u": false },
    //   { "_id": 1, "im1": 1, "im2": 1 },
    //   { sort: { t: 1 }, limit: numberOfComparisonsToSelect }
    // ).exec();
    // if (!selectedComparisons) {
    //   return res.status(400).send('Failed to select images');
    // }
      


    // imageLeftIds and imageRightIds contain the image pairs that will
    // be compared. imageLeftIds contains the images that will be
    // displayed on the left and imageRightIds the images that will be
    // displayed on the right.
    let imageLeftIds = []
    let imageRightIds = []

    // determine randomly the position (left or right) that images will
    // be displayed
    let imageOrder = (Math.random() > 0.5) ? true : false

    for (let i = 0; i < selectedComparisons.length; i++) {

      if (imageOrder) {
        imageLeftIds.push(selectedComparisons[i].im1)
        imageRightIds.push(selectedComparisons[i].im2)
      }
      else {
        imageLeftIds.push(selectedComparisons[i].im2)
        imageRightIds.push(selectedComparisons[i].im1)
      }
    }

    // add the answer quality control comparisons. These comparisons
    // are selected randomly from imageLeftIds and imageRightIds arrays
    let answerControlIndex1 = numberOfComparisons / answerQualityControls - 1
    let answerControlIndex2 = numberOfComparisons - 1

    let controlComparisonIndex1 = randomInteger(0, answerControlIndex1 - 1)
    let controlComparisonIndex2 = randomInteger(answerControlIndex1 + 1, answerControlIndex2 - 1)

    imageLeftIds.splice(answerControlIndex1, 0, imageRightIds[controlComparisonIndex1])
    imageRightIds.splice(answerControlIndex1, 0, imageLeftIds[controlComparisonIndex1])

    imageLeftIds.splice(answerControlIndex2, 0, imageRightIds[controlComparisonIndex2])
    imageRightIds.splice(answerControlIndex2, 0, imageLeftIds[controlComparisonIndex2])

    res.status(200).send({
      '_id': voteSession.id,
      'imageLeftIds': imageLeftIds,
      'imageRightIds': imageRightIds
    })

    console.log('\nNew vote session started: ' + voteSession.id)

    // Mark the comparisons that are currently used by the vote session as "used"
    // so they are not selected by another vote session. After a time interval,
    // the comparisons will be marked again as "not used".
    for (const comp of selectedComparisons) {
      await Comparison.updateOne({ "_id": comp._id }, { $set: { "u": true } });
    }

    // timeout time in milliseconds
    const timeoutTime = (numberOfComparisons+1) * timeLimitOfEachComparison * 1000 + 2000;

    setTimeout(async () => {
      for (const comp of selectedComparisons) {
        await Comparison.updateOne({ "_id": comp._id }, { $set: { "u": false } });
      }
    }, timeoutTime);
    
  } catch(err) {
    res.status(400).send('Failed to add new voteSession')
    console.log('Failed to start new vote session')
    console.log(err)
  };

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
            currentBatchIndex++; //Increase index counter to iterate the next batch of images
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
})
