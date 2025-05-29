#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'
import crypto from 'crypto'
import {registerAllPrompts} from './prompts/register.js'
import {registerAllResources} from './resources/register.js'
import {registerAllTools} from './tools/register.js'
import {env} from './config/env.js'
import {VERSION} from './config/version.js'

const MCP_SERVER_NAME = '@sanity/mcp'

async function initializeServer() {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: VERSION,
  })

  registerAllTools(server, env.data?.MCP_USER_ROLE)
  registerAllPrompts(server)
  registerAllResources(server)

  return server
}

async function startSSEServer(port: number = 3000) {
  const app = express()
  
  // Enable CORS for SSE connections
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
    res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization, x-api-key')
    if (req.method === 'OPTIONS') {
      res.sendStatus(200)
      return
    }
    next()
  })

  app.use(express.json({ limit: '4mb' }))

  const server = await initializeServer()
  
  // Store multiple transports by session ID
  const transports = new Map<string, SSEServerTransport>()

  // SSE endpoint for establishing streaming connection
  app.get('/sse', (req, res) => {
    // Validate Origin header to prevent DNS rebinding attacks (skip in Railway deployment)
    const origin = req.headers.origin
    const isLocalDev = !process.env.PORT && !process.env.RAILWAY_ENVIRONMENT
    
    if (isLocalDev && origin && !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin)) {
      console.warn(`Rejected SSE connection from unauthorized origin: ${origin}`)
      res.status(403).send('Forbidden')
      return
    }

    try {
      // Generate unique session ID
      const sessionId = crypto.randomUUID()
      console.log(`New SSE connection established with session ID: ${sessionId}`)
      
      // Create new transport for this session
      const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res)
      transports.set(sessionId, transport)
      
      // Clean up transport when connection closes
      res.on('close', () => {
        console.log(`SSE connection closed for session: ${sessionId}`)
        transports.delete(sessionId)
      })
      
      // Connect server to this transport
      server.connect(transport)
    } catch (error) {
      console.error('Error establishing SSE connection:', error)
      res.status(500).send('Internal Server Error')
    }
  })

  // Message endpoint for receiving client messages
  app.post('/messages', (req, res) => {
    try {
      const sessionId = req.query.sessionId as string
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId parameter' })
      }
      
      const transport = transports.get(sessionId)
      if (!transport) {
        return res.status(400).json({ error: 'No SSE connection found for session ID' })
      }
      
      // Handle the message with the correct transport
      transport.handlePostMessage(req, res)
    } catch (error) {
      console.error('Error handling message:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      server: MCP_SERVER_NAME, 
      version: VERSION,
      transport: 'sse',
      activeConnections: transports.size
    })
  })

  // Bind to appropriate interface based on environment
  const host = process.env.PORT || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1'
  app.listen(port, host, () => {
    console.error(`Sanity MCP Server running on http://${host}:${port}`)
    console.error(`SSE endpoint: http://${host}:${port}/sse`)
    console.error(`Messages endpoint: http://${host}:${port}/messages`)
    console.error(`Health check: http://${host}:${port}/health`)
  })
}

async function startStdioServer() {
  const server = await initializeServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Sanity MCP Server running on stdio')
}

async function main() {
  try {
    const args = process.argv.slice(2)
    const transportType = args.find(arg => arg.startsWith('--transport='))?.split('=')[1] || 
                         (process.env.RAILWAY_ENVIRONMENT || process.env.PORT ? 'sse' : 'stdio')
    const portArg = args.find(arg => arg.startsWith('--port='))?.split('=')[1]
    const port = portArg ? parseInt(portArg, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000)

    if (transportType === 'sse') {
      await startSSEServer(port)
    } else {
      await startStdioServer()
    }
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()
