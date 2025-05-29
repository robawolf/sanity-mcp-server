# 🚂 Railway Deployment Guide

This guide helps you deploy the Sanity MCP Server to Railway with SSE transport.

## 🚀 Quick Setup

### 1. Environment Variables

Set these environment variables in your Railway project:

**Required:**
```bash
MCP_USER_ROLE=developer
SANITY_PROJECT_ID=your-sanity-project-id
SANITY_DATASET=production
SANITY_API_TOKEN=your-sanity-api-token
```

**Optional:**
```bash
SANITY_API_HOST=https://api.sanity.io
```

### 2. Railway Dashboard Setup

1. Go to your Railway project dashboard
2. Click on your service
3. Navigate to **"Variables"** tab
4. Add each environment variable:

| Variable | Value | Description |
|----------|-------|-------------|
| `MCP_USER_ROLE` | `developer` | User role (developer/editor) |
| `SANITY_PROJECT_ID` | `your-project-id` | Your Sanity project ID |
| `SANITY_DATASET` | `production` | Dataset name |
| `SANITY_API_TOKEN` | `your-token` | Sanity API token |

### 3. Railway CLI Setup (Alternative)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Set variables
railway variables set MCP_USER_ROLE=developer
railway variables set SANITY_PROJECT_ID=your-project-id
railway variables set SANITY_DATASET=production
railway variables set SANITY_API_TOKEN=your-token

# Deploy
railway up
```

## 🔧 Automatic Configuration

The server automatically detects Railway environment and:
- ✅ Uses **SSE transport** by default
- ✅ Binds to `0.0.0.0` (all interfaces)
- ✅ Uses Railway's `PORT` environment variable
- ✅ Skips origin validation for cloud deployment

## 🌐 Access Your Deployed Server

Once deployed, Railway will provide a public URL like:
```
https://your-service-name.railway.app
```

**Available endpoints:**
- `GET /health` - Health check
- `GET /sse` - SSE connection endpoint
- `POST /messages` - Message handling

## 📋 Client Configuration

Use your Railway URL in client configurations:

**Claude Desktop:**
```json
{
  "mcpServers": {
    "sanity": {
      "transport": {
        "type": "sse",
        "url": "https://your-service-name.railway.app/sse"
      },
      "env": {
        "SANITY_PROJECT_ID": "your-project-id",
        "SANITY_DATASET": "production",
        "SANITY_API_TOKEN": "your-token",
        "MCP_USER_ROLE": "developer"
      }
    }
  }
}
```

## 🔍 Troubleshooting

### Environment Variable Errors

**Error:**
```
Invalid environment variables {
  MCP_USER_ROLE: {
    _errors: ["Invalid discriminator value. Expected 'developer' | 'editor' | 'internal_agent_role'"]
  }
}
```

**Solution:** Set `MCP_USER_ROLE` to exactly `developer` or `editor`

### Missing Project ID/Dataset

**Error:**
```
SANITY_PROJECT_ID: { _errors: ["Required"] }
SANITY_DATASET: { _errors: ["Required"] }
```

**Solution:** Set both `SANITY_PROJECT_ID` and `SANITY_DATASET` variables

### Authentication Issues

**Error:** API authentication failures

**Solution:** 
1. Verify your `SANITY_API_TOKEN` is correct
2. Ensure the token has appropriate permissions
3. Check that the project ID matches your token's project

### Port Binding Issues

Railway automatically sets the `PORT` environment variable. The server will:
- Use Railway's `PORT` if available
- Default to port 3000 for local development
- Bind to `0.0.0.0` in Railway (required for public access)

### Health Check

Test your deployment:
```bash
curl https://your-service-name.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "server": "@sanity/mcp",
  "version": "0.9.3",
  "transport": "sse",
  "connected": false
}
```

## 🔒 Security Notes

- **Local Development**: Origin validation enabled, localhost binding
- **Railway Deployment**: Origin validation disabled, public binding
- **CORS**: Enabled for web client compatibility
- **Message Limits**: 4MB maximum message size

## 📝 Logs

Monitor your Railway deployment logs for:
- Server startup messages
- SSE connection establishments
- Error messages
- Environment variable validation

## 🚀 Next Steps

1. Test the health endpoint
2. Configure your MCP client
3. Establish SSE connection
4. Start using Sanity tools remotely! 