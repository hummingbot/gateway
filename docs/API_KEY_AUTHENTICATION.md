# API Key Authentication

Gateway now supports API key authentication for production deployments where the app and Gateway are running on different machines or networks.

## Overview

- **Dev Mode**: No authentication required (default for local development)
- **Production Mode**: Optional API key authentication via `X-API-Key` header
- **Multiple Keys**: Support for multiple API keys (e.g., different clients)

## Gateway Configuration

### 1. Generate API Keys

Generate secure API keys using OpenSSL:

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string like:
```
aaaabbbbccccddddeeeeffffgggghhhh11112222333344445555666677778888
```

### 2. Configure Gateway

Edit `conf/server.yml` and add your API keys:

```yaml
# API keys for authenticating requests to Gateway (optional, for production deployments)
# Multiple API keys can be provided as a list. Each key should be a secure random string.
# If no keys are provided or the list is empty, API key authentication is disabled.
# Generate secure keys with: openssl rand -hex 32
apiKeys:
  - aaaabbbbccccddddeeeeffffgggghhhh11112222333344445555666677778888
  - your-second-api-key-here
```

### 3. Run Gateway in Production Mode

Start Gateway without the `--dev` flag:

```bash
pnpm start --passphrase=<YOUR_PASSPHRASE>
```

Or with Docker:

```bash
docker run -e GATEWAY_PASSPHRASE=<YOUR_PASSPHRASE> -p 15888:15888 gateway
```

## Gateway App Configuration

### 1. Create Environment File

Create a `.env` file in the `gateway-app/` directory:

```bash
# Gateway API URL (use HTTPS for production)
VITE_GATEWAY_URL=https://your-gateway-host:15888

# Gateway API Key (must match one of the keys in Gateway's conf/server.yml)
VITE_GATEWAY_API_KEY=aaaabbbbccccddddeeeeffffgggghhhh11112222333344445555666677778888
```

### 2. Build and Run

Build the app with the environment variables:

```bash
cd gateway-app
pnpm build
```

For Tauri desktop app:

```bash
cd gateway-app
pnpm tauri build
```

## Authentication Behavior

### Dev Mode (`--dev` flag or `GATEWAY_TEST_MODE=dev`)

- API key authentication is **disabled**
- All requests are accepted without `X-API-Key` header
- Runs on HTTP (not HTTPS) for easier local development
- Gateway logs: No API key authentication messages

### Production Mode (no `--dev` flag)

#### With API Keys Configured (`apiKeys` array has values)

- API key authentication is **enabled**
- Requests without `X-API-Key` header → 401 Unauthorized
- Requests with invalid `X-API-Key` → 401 Unauthorized
- Requests with valid `X-API-Key` → Allowed
- Gateway logs: "API key authentication enabled"

#### Without API Keys Configured (`apiKeys` array is empty)

- API key authentication is **disabled**
- All requests are accepted
- Gateway logs: "Running in production mode without API key authentication. Configure server.apiKeys for security."

## Testing

### Test Configuration

```bash
# Test that apiKeys configuration is loaded
GATEWAY_TEST_MODE=dev jest --runInBand test/auth/api-key.test.ts
```

### Test with curl

```bash
# Without API key (should fail in production with apiKeys configured)
curl http://localhost:15888/config/chains

# With API key
curl -H "X-API-Key: your-api-key-here" http://localhost:15888/config/chains
```

## Security Best Practices

1. **Never commit API keys to version control**
   - Add `.env` to `.gitignore`
   - Use environment variables or secure vaults

2. **Use HTTPS in production**
   - API keys sent over HTTP can be intercepted
   - Gateway uses mTLS by default (HTTPS with client certificates)

3. **Rotate API keys regularly**
   - Generate new keys periodically
   - Support multiple keys to allow rotation without downtime

4. **One key per client**
   - Use different API keys for different apps/clients
   - Makes it easier to revoke access for specific clients

5. **Monitor failed authentication attempts**
   - Check Gateway logs for repeated 401 errors
   - Could indicate attempted unauthorized access

## Error Messages

### 401 Unauthorized - Missing API Key

```json
{
  "error": "Unauthorized",
  "message": "API key is required. Please provide X-API-Key header."
}
```

### 401 Unauthorized - Invalid API Key

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key."
}
```

## Migration from Dev to Production

1. **Generate API keys** using OpenSSL
2. **Update Gateway config** (`conf/server.yml`) with API keys
3. **Restart Gateway without `--dev` flag**
4. **Create `.env` file** in gateway-app with `VITE_GATEWAY_URL` and `VITE_GATEWAY_API_KEY`
5. **Rebuild gateway-app** to include environment variables
6. **Test authentication** with curl or app

## Troubleshooting

### App shows "Gateway API error: 401"

- Check that `VITE_GATEWAY_API_KEY` in `.env` matches one of the keys in `conf/server.yml`
- Ensure app was rebuilt after adding `.env` file
- Verify Gateway is running in production mode (no `--dev` flag)
- Check Gateway logs for authentication errors

### Gateway logs "Running in production mode without API key authentication"

- This is a warning that you're in production mode but haven't configured API keys
- Add API keys to `conf/server.yml` to enable authentication
- Or run with `--dev` flag for local development

### Tests failing with "additional property apiKeys"

- Run `pnpm build` to rebuild with new schema
- Run `pnpm run setup:with-defaults` to update runtime config
- Delete `conf/server.yml` and re-run setup if needed
