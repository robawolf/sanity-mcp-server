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

  // Initialize server once
  const server = await initializeServer()
  
  // Store the SSE transport when created
  const transports = new Map<string, SSEServerTransport>()

  // SSE endpoint for establishing streaming connection
  app.get('/sse', async (req, res) => {
    console.log('SSE connection request received')
    
    try {
      // Create transport - it will set its own SSE headers
      const transport = new SSEServerTransport('/messages', res)
      
      // Generate a session ID for tracking
      const sessionId = Math.random().toString(36).substring(7)
      console.log(`Creating SSE transport with tracking ID: ${sessionId}`)
      
      // Store transport
      transports.set(sessionId, transport)
      
      // Handle connection close
      req.on('close', () => {
        console.log(`SSE connection closed: ${sessionId}`)
        transports.delete(sessionId)
      })
      
      // Connect the transport to the server
      await server.connect(transport)
      console.log(`SSE connection established: ${sessionId}`)
      
    } catch (error) {
      console.error('Error establishing SSE connection:', error)
      if (!res.headersSent) {
        res.status(500).end()
      }
    }
  })

  // Message endpoint for receiving client messages
  app.post('/messages', async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string
      console.log(`Received POST /messages with sessionId: ${sessionId}`)
      
      // Try each transport until one handles it successfully
      let handled = false
      let lastError: any = null
      
      for (const [id, transport] of transports) {
        try {
          await transport.handlePostMessage(req, res)
          handled = true
          console.log(`Message handled by transport ${id}`)
          return // Important: return immediately after successful handling
        } catch (error: any) {
          // If error message includes "session", it's not for this transport
          if (error?.message?.includes('session')) {
            continue
          }
          lastError = error
          console.error(`Transport ${id} error:`, error?.message)
        }
      }
      
      if (!handled) {
        console.error('No transport could handle the message. Last error:', lastError?.message)
        if (!res.headersSent) {
          res.status(400).json({ 
            error: 'No active SSE connection for this session',
            details: lastError?.message 
          })
        }
      }
    } catch (error: any) {
      console.error('Error in /messages handler:', error)
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          details: error?.message 
        })
      }
    }
  })

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      server: MCP_SERVER_NAME, 
      version: VERSION,
      transport: 'sse',
      activeConnections: transports.size,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'railway' : 'local'
    })
  })

  // Bind to appropriate interface based on environment
  const host = process.env.PORT || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1'
  app.listen(port, host, () => {
    console.log(`Sanity MCP Server (SSE mode) started`)
    console.log(`Host: ${host}:${port}`)
    console.log(`Environment: ${process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'}`)
    console.log(`Endpoints:`)
    console.log(`  - SSE: http://${host}:${port}/sse`)
    console.log(`  - Messages: http://${host}:${port}/messages`)
    console.log(`  - Health: http://${host}:${port}/health`)
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
