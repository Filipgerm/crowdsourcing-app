# Install node image in container
FROM node:14

# Create and set the working directory
RUN mkdir -p /app/queue
WORKDIR /app/queue

# Copy the dependency files to the container
COPY package*.json /app/queue/

# Install dependencies
RUN npm install

# Copy the worker files to the container
COPY . /app/queue/

# Run the worker script
CMD ["npm", "start"]