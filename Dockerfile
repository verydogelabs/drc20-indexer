FROM node:18-alpine AS build

# Create App dir
RUN mkdir -p /app

# Set working directory to App dir
WORKDIR /app

# Copy project files
COPY . .

RUN cp .env.example .env

# Install deps
RUN npm install && npm install -g typescript && npm run build

FROM node:18-alpine as app

COPY --from=build /app .

WORKDIR /app