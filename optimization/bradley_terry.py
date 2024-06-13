from scipy.optimize import minimize
import numpy as np
from flask import Flask, request, jsonify
import logging
from joblib import Parallel, delayed

app = Flask(__name__)

logging.basicConfig(level=logging.DEBUG)

def bradley_terry_log_likelihood(params, comparisons):
    try:
        image_strengths = np.exp(params)
        likelihood = 0
        epsilon = 1e-10

        for comparison in comparisons:
            im1, im2, w1, w2 = comparison
            prob_im1_wins = image_strengths[int(im1)] / (image_strengths[int(im1)] + image_strengths[int(im2)])
            prob_im2_wins = image_strengths[int(im2)] / (image_strengths[int(im1)] + image_strengths[int(im2)])
            likelihood += w1 * np.log(prob_im1_wins + epsilon) + w2 * np.log(prob_im2_wins + epsilon)

        regularization = 0.01 * np.sum(params**2)
        likelihood -= regularization

        return -likelihood
    except Exception as e:
        logging.error(f"Error in bradley_terry_log_likelihood: {str(e)}")
        raise


def optimize_single_batch(initial_params, comparisons_batch):
    result = minimize(
        fun=bradley_terry_log_likelihood,
        x0=initial_params,
        args=(comparisons_batch,),
        method='L-BFGS-B',
        options={'maxiter': 100}  # max iterations 
    )
    logging.debug(f"Completed optimization batch")
    return result.x

@app.route('/optimize', methods=['POST'])
def optimize():
    try:
        data = request.json
        # logging.debug(f"Received data: {data}")

        # Convert initial parameters and comparisons to numpy arrays
        initial_params = np.array(data['initialParams'])
        comparisons = np.array([[comp['im1'], comp['im2'], comp['w1'], comp['w2']] for comp in data['comparisons']])


        # logging.debug(f"Initial parameters: {initial_params}")
        # logging.debug(f"Comparisons: {comparisons}")

        n_batches = 10  # Number of batches to split the comparisons into
        comparisons_batches = np.array_split(comparisons, n_batches)

        # Perform parallel optimization
        results = Parallel(n_jobs=-1)(delayed(optimize_single_batch)(initial_params, batch) for batch in comparisons_batches)

        # Aggregate results
        optimal_params = np.mean(results, axis=0)

        # logging.debug(f"Optimization result: {optimal_params}")
        return jsonify({'optimal_params': optimal_params.tolist()})

    except Exception as e:
        logging.error(f"Error during optimization: {str(e)}")
        logging.error(f"Request data: {data}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
