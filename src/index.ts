#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'
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

  // Map to store transport instances and their associated servers
  const connections = new Map<string, { transport: SSEServerTransport; server: McpServer }>()

  // SSE endpoint for establishing streaming connection
  app.get('/sse', async (req, res) => {
    console.log('SSE connection request received', {
      headers: req.headers,
      url: req.url,
      method: req.method
    })
    
    // Validate Origin header to prevent DNS rebinding attacks (skip in Railway deployment)
    const origin = req.headers.origin
    const isLocalDev = !process.env.PORT && !process.env.RAILWAY_ENVIRONMENT
    
    if (isLocalDev && origin && !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin)) {
      console.warn(`Rejected SSE connection from unauthorized origin: ${origin}`)
      res.status(403).send('Forbidden')
      return
    }

    try {
      console.log('Creating new SSE connection...')
      
      // Create a new server instance for this connection
      const server = await initializeServer()
      
      // Create transport with unique session handling
      const transport = new SSEServerTransport('/messages', res)
      
      // Store connection info before connecting
      // The transport will generate its own session ID
      const connectionId = Math.random().toString(36).substring(7)
      
      // Clean up when connection closes
      res.on('close', () => {
        console.log(`SSE connection closed for ${connectionId}`)
        connections.delete(connectionId)
      })
      
      res.on('error', (error) => {
        console.error(`SSE response error for ${connectionId}:`, error)
        connections.delete(connectionId)
      })
      
      // Connect server to transport
      console.log(`Connecting server to transport for ${connectionId}...`)
      await server.connect(transport)
      
      // Store after successful connection
      connections.set(connectionId, { transport, server })
      
      console.log(`SSE connection established: ${connectionId} (${connections.size} active connections)`)
    } catch (error) {
      console.error('Error establishing SSE connection:', error)
      res.status(500).send('Internal Server Error')
    }
  })

  // Message endpoint for receiving client messages
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string
    
    console.log(`POST /messages request with sessionId: ${sessionId}`)
    
    if (!sessionId) {
      console.error('Missing sessionId parameter')
      return res.status(400).json({ error: 'Missing sessionId parameter' })
    }
    
    // Find the connection that can handle this session
    let handled = false
    let lastError: any = null
    
    console.log(`Searching among ${connections.size} active connections`)
    
    for (const [connId, connection] of connections) {
      try {
        // Try to handle with this transport
        // The transport will validate if this is its session
        await connection.transport.handlePostMessage(req, res)
        handled = true
        console.log(`Message handled by connection ${connId}`)
        break
      } catch (error) {
        // This transport couldn't handle it, try the next one
        lastError = error
        continue
      }
    }
    
    if (!handled) {
      console.error(`No transport found for session ${sessionId}. Last error:`, lastError)
      res.status(400).json({ error: 'Invalid session or connection closed' })
    }
  })

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      server: MCP_SERVER_NAME, 
      version: VERSION,
      transport: 'sse',
      activeConnections: connections.size
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
