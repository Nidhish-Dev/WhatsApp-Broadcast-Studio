# Use Node.js base image
FROM node:18-slim

# Install system dependencies to run headless Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update && apt-get install -y \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Disable automatic puppeteer chromium downloads (we use system-installed chrome)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install project packages
RUN npm install

# Copy project source files
COPY . .

# Run build step
RUN npm run build

# Expose server port
EXPOSE 3000

# Configure Chrome path for Linux containers
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Run Next.js server
CMD ["npm", "run", "start"]
