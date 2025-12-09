FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Environment defaults (can be overridden at runtime)
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]


