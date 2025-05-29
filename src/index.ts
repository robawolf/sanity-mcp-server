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

  const server = await initializeServer()
  let transport: SSEServerTransport | null = null

  // SSE endpoint for establishing streaming connection
  app.get('/sse', (req, res) => {
    // Validate Origin header to prevent DNS rebinding attacks
    const origin = req.headers.origin
    if (origin && !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin)) {
      console.warn(`Rejected SSE connection from unauthorized origin: ${origin}`)
      res.status(403).send('Forbidden')
      return
    }

    console.log('New SSE connection established')
    transport = new SSEServerTransport('/messages', res)
    server.connect(transport)
  })

  // Message endpoint for receiving client messages
  app.post('/messages', (req, res) => {
    if (transport) {
      transport.handlePostMessage(req, res)
    } else {
      res.status(400).json({ error: 'No SSE connection established' })
    }
  })

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      server: MCP_SERVER_NAME, 
      version: VERSION,
      transport: 'sse',
      connected: transport !== null 
    })
  })

  // Bind only to localhost for security
  app.listen(port, '127.0.0.1', () => {
    console.error(`Sanity MCP Server running on http://127.0.0.1:${port}`)
    console.error(`SSE endpoint: http://127.0.0.1:${port}/sse`)
    console.error(`Messages endpoint: http://127.0.0.1:${port}/messages`)
    console.error(`Health check: http://127.0.0.1:${port}/health`)
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
    const transportType = args.find(arg => arg.startsWith('--transport='))?.split('=')[1] || 'stdio'
    const portArg = args.find(arg => arg.startsWith('--port='))?.split('=')[1]
    const port = portArg ? parseInt(portArg, 10) : 3000

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
