# Set the base image
FROM node:20-bookworm-slim

# WORKDIR /usr/src/app/
WORKDIR /home/gateway

# Create mount points
RUN mkdir -p /home/gateway/conf /home/gateway/logs /home/gateway/db /home/gateway/certs

# Install pnpm
RUN npm install -g pnpm@latest

# Copy package files first
COPY package.json pnpm-lock.yaml ./

# Dockerfile author / maintainer
LABEL maintainer="Michael Feng <mike@hummingbot.org>"

# Build arguments
ARG BRANCH
ARG COMMIT
ARG BUILD_DATE

# Labels using build args
LABEL branch=${BRANCH}
LABEL commit=${COMMIT}
LABEL date=${BUILD_DATE}

# Set ENV variables
ENV COMMIT_BRANCH=${BRANCH}
ENV COMMIT_SHA=${COMMIT}
ENV BUILD_DATE=${BUILD_DATE}
ENV INSTALLATION_TYPE=docker
ENV DEV=false

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the files
COPY . .

# Build
RUN pnpm build

# Expose port 15888 - note that docs port is 8080
EXPOSE 15888

# Set the default command to run when starting the container
CMD ["sh", "-c", "if [ \"$DEV\" = \"true\" ]; then pnpm start --dev; else pnpm start; fi"]
