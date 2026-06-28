# Use Node.js base image
FROM node:18-slim

# Install system dependencies and Chromium from Debian repository
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Disable automatic puppeteer chromium downloads (we use system-installed chromium)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install project packages
RUN npm install

# Copy project source files
COPY . .

# Run build step
RUN npm run build

# Expose server port
EXPOSE 3000

# Configure Chromium path for Linux containers
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run Next.js server
CMD ["npm", "run", "start"]
