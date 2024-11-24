# Use Node.js LTS version
FROM node:18-slim

# Install required fonts and dependencies
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    fontconfig \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Create temp directory for file processing
RUN mkdir -p temp

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Create volume for persistent data
VOLUME ["/usr/src/app/temp"]

# Start the application
CMD [ "npm", "start" ]
