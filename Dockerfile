# Set the base image
# Node 20 reached EOL in April 2026; using Node 22 LTS.
FROM node:22-bookworm-slim

# WORKDIR /usr/src/app/
WORKDIR /home/gateway

# Create mount points
RUN mkdir -p    /home/gateway/conf \
                /home/gateway/conf/chains \
                /home/gateway/conf/connectors \
                /home/gateway/conf/namespace \
                /home/gateway/conf/pools \
                /home/gateway/conf/rpc \
                /home/gateway/conf/tokens \
                /home/gateway/conf/wallets \
                /home/gateway/logs \
                /home/gateway/certs

# Install pnpm (pinned to major to keep Docker builds reproducible)
RUN npm install -g pnpm@11

# Copy package files first (pnpm-workspace.yaml carries overrides + allowBuilds, needed at install time)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

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
ENV DEV=true

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the files
COPY . .

# Build
RUN pnpm build

# Create necessary conf directories

# Expose default port and Swagger UI on http://localhost:15888/docs
EXPOSE 15888

# Set the default command to run when starting the container
CMD ["sh", "-c", "if [ \"$DEV\" = \"true\" ]; then pnpm start --dev; else pnpm start; fi"]
