const Queue = require('bull');
const EventEmitter = require('events');
const progressEmitter = new EventEmitter(); // Create progressEmitter
const axios = require('axios'); //library to make HTTP requests
const redis = require('redis');
// const optimizeBradleyTerry = require('./path/to/optimizeBradleyTerry'); // Import your optimization function

// Initialize Redis client
const redisClient = redis.createClient({
  host: 'redis', // process.env.REDIS_HOST || 'redis'
  port: '6379' // process.env.REDIS_PORT || 6379
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

const optimizationQueue = new Queue('optimization', {
  redis: {
    host: 'redis',
    port: '6379'
  }
});


optimizationQueue.on('error', (err) => {
  console.error('Queue error:', err);
});

optimizationQueue.on('waiting', (jobId) => {
  console.log('A job is waiting to be processed:', jobId);
});

optimizationQueue.on('active', (job, jobPromise) => {
  console.log('Job is now active:', job.id);
});



  const optimizeBradleyTerry = async (initialParams, comparisons) => {
    try {
        const progressInterval = 1000; //  interval for progress reporting in milliseconds
        let iterations = 0;
        const response = await axios.post('http://optimization:5000/optimize', {
            initialParams: initialParams,
            comparisons: comparisons
        }, {
            onDownloadProgress: (progressEvent) => {
                iterations++; // Increment the iteration count
                if (iterations % progressInterval === 0) {
                  // Emit custom event for progress update
                  progressEmitter.emit('progress', iterations);
                }
            }
        });
        return response.data.optimal_params;
    } catch (error) {
        console.error('Error optimizing Bradley-Terry model:', error);
        progressEmitter.emit('error', error); // Emit custom event for handling errors elsewhere
        throw error;
    }
};


optimizationQueue.process(async (job) => {
  const { sessionId, initialParams, comparisons } = job.data;

  try {

    // This could be an async function call or any other processing logic
    console.log('Processing job for session ID:', sessionId);
    console.log('Initial parameters:', initialParams);
    console.log('Comparisons:', comparisons);
    // Perform optimization task using the provided data
    const optimalParams = await optimizeBradleyTerry(initialParams, comparisons);
    
    // Optionally, you can do something with the result of optimization
    console.log('Optimal parameters Calculated!:', optimalParams);

    const resultParams = optimalParams;
    // Return data to the main application
    return { sessionId, resultParams };
  } catch (error) {
    console.error('Error optimizing Bradley-Terry model:', error);
    progressEmitter.emit('error', error); // Emit custom event for handling errors elsewhere
    throw error; // Let Bull handle the error and retry if needed
  }
});
