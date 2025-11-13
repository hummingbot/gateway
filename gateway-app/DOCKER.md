# Gateway App - Docker Setup

This document explains how to run Gateway App using Docker.

## Overview

The Gateway App can be deployed using Docker in two modes:
- **Development**: Runs Vite dev server with hot reload
- **Production**: Builds static files and serves with nginx

## Prerequisites

- Docker and Docker Compose installed
- Gateway backend running (configured in docker compose.yml)

## Development Mode

Development mode runs the Vite dev server with hot reload enabled.

### Start Development Environment

From the gateway root directory:

```bash
# Start both gateway backend and gateway-app frontend
docker compose up

# Or start only gateway-app (if gateway is already running)
docker compose up gateway-app
```

The app will be available at:
- **Gateway App**: http://localhost:1420
- **Gateway API**: http://localhost:15888

### Features
- Hot reload on code changes
- Source maps for debugging
- Volume mounts for live code updates

### Configuration

The development setup uses:
- **Dockerfile**: `Dockerfile.dev`
- **Port**: 1420 (configured in vite.config.ts)
- **Volumes**: Source code mounted for hot reload
- **Environment**: `VITE_GATEWAY_URL=http://gateway:15888`

## Production Mode

Production mode builds optimized static files and serves them with nginx.

### Build and Start Production Environment

From the gateway root directory:

```bash
# Use production docker compose file
docker compose -f docker compose.prod.yml up --build

# Or build and run in detached mode
docker compose -f docker compose.prod.yml up -d --build
```

The app will be available at:
- **Gateway App**: http://localhost:3000
- **Gateway API**: http://localhost:15888

### Features
- Optimized production build
- Gzip compression
- Static asset caching
- Security headers
- SPA routing support

### Configuration

The production setup uses:
- **Dockerfile**: `Dockerfile`
- **Port**: 80 (exposed as 3000 on host)
- **Server**: nginx
- **Environment**: `VITE_GATEWAY_URL=http://gateway:15888`

## Docker Files

### Dockerfile.dev
Development container that runs Vite dev server:
- Based on `node:20-alpine`
- Installs pnpm and dependencies
- Runs `pnpm dev --host 0.0.0.0`
- Exposes port 1420

### Dockerfile
Production multi-stage build:
- **Stage 1 (builder)**: Builds the app with `pnpm build`
- **Stage 2 (nginx)**: Serves static files with nginx
- Includes custom nginx configuration for SPA routing
- Exposes port 80

### .dockerignore
Excludes unnecessary files from Docker build context:
- node_modules
- Build outputs
- Tauri-specific files
- IDE files
- Git files

### nginx.conf
Production nginx configuration:
- Gzip compression enabled
- Security headers
- SPA routing (try_files)
- Static asset caching
- No caching for index.html

## Networking

Both services are connected via a custom bridge network `gateway-network`:

```yaml
networks:
  gateway-network:
    driver: bridge
```

This allows:
- Gateway app to communicate with gateway backend using `http://gateway:15888`
- Isolated network for all gateway services
- DNS resolution between containers

## Environment Variables

### VITE_GATEWAY_URL
URL of the Gateway backend API. Set in docker compose.yml:

```yaml
environment:
  - VITE_GATEWAY_URL=http://localhost:15888
```

**Important**: We use `http://localhost:15888` (not `http://gateway:15888`) because:
- Vite embeds environment variables at build time
- The frontend runs in browser on your host machine, not inside Docker
- The browser needs to connect to the Gateway API exposed on `localhost:15888`
- The `gateway` hostname only works for container-to-container communication

For local development outside Docker, create `.env.local`:

```bash
VITE_GATEWAY_URL=http://localhost:15888
```

### GATEWAY_PASSPHRASE
Gateway backend passphrase (configured in gateway service):

```yaml
environment:
  - GATEWAY_PASSPHRASE=a # Use strong passphrase in production
```

## Common Commands

### Start services
```bash
# Development
docker compose up

# Production
docker compose -f docker compose.prod.yml up --build
```

### Stop services
```bash
docker compose down
```

### Rebuild containers
```bash
# Development
docker compose up --build

# Production
docker compose -f docker compose.prod.yml up --build
```

### View logs
```bash
# All services
docker compose logs -f

# Gateway app only
docker compose logs -f gateway-app
```

### Access container shell
```bash
# Development
docker exec -it gateway-app sh

# Production
docker exec -it gateway-app sh
```

## Troubleshooting

### Gateway API not accessible
- Ensure gateway service is running: `docker compose ps`
- Check gateway logs: `docker compose logs gateway`
- Verify network: `docker network ls | grep gateway`

### Hot reload not working (Development)
- Ensure volumes are mounted correctly in docker compose.yml
- Check file permissions on mounted volumes
- Restart the container: `docker compose restart gateway-app`

### Build fails
- Clear Docker cache: `docker compose build --no-cache gateway-app`
- Check Dockerfile syntax
- Verify package.json dependencies

### Port conflicts
- Change port mapping in docker compose.yml if 1420 or 3000 is in use:
  ```yaml
  ports:
    - "8080:1420"  # Map to different host port
  ```

## Production Deployment

For production deployment with API key authentication:

### 1. Generate API Key

```bash
# Generate a secure API key
openssl rand -hex 32
```

### 2. Set Environment Variables

Create a `.env` file in the gateway root directory:

```bash
# Gateway Backend
GATEWAY_PASSPHRASE=your-secure-passphrase
GATEWAY_API_KEYS=your-generated-api-key

# Gateway Frontend
GATEWAY_API_KEY=your-generated-api-key
```

**Note**: Use the same API key for both `GATEWAY_API_KEYS` (backend accepts this key) and `GATEWAY_API_KEY` (frontend uses this key).

### 3. Deploy with Docker Compose

```bash
# Build and start production containers
docker compose -f docker-compose.prod.yml up -d --build
```

Access the app at: http://localhost:1420

### 4. Additional Production Considerations

1. Use strong `GATEWAY_PASSPHRASE` for wallet encryption
2. Keep API keys secret (add `.env` to `.gitignore`)
3. Consider using reverse proxy (nginx/traefik) for HTTPS
4. Configure proper domain names and SSL certificates
5. Regularly rotate API keys

### Example with HTTPS

```yaml
services:
  gateway:
    environment:
      - GATEWAY_PASSPHRASE=${GATEWAY_PASSPHRASE}
      - DEV=false
    volumes:
      - ./certs:/home/gateway/certs  # SSL certificates

  gateway-app:
    # Add reverse proxy labels for traefik/nginx
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gateway-app.rule=Host(`app.example.com`)"
      - "traefik.http.routers.gateway-app.tls=true"
```
