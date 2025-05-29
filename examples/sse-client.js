#!/usr/bin/env node

/**
 * Simple SSE Client Example for Sanity MCP Server
 * 
 * This demonstrates how to connect to the Sanity MCP server using 
 * Server-Sent Events (SSE) transport instead of stdio.
 * 
 * Usage:
 * 1. Start the MCP server: npm run start:sse
 * 2. Run this client: node examples/sse-client.js
 */

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

class SanityMCPClient {
  constructor(serverUrl = 'http://127.0.0.1:3000') {
    this.serverUrl = serverUrl;
    this.client = null;
    this.transport = null;
  }

  async connect() {
    try {
      console.log(`Connecting to Sanity MCP Server at ${this.serverUrl}...`);
      
      // Create SSE transport
      this.transport = new SSEClientTransport(
        new URL(`${this.serverUrl}/sse`)
      );

      // Create MCP client
      this.client = new Client({
        name: "sanity-sse-client",
        version: "1.0.0"
      }, {
        capabilities: {}
      });

      // Connect to the server
      await this.client.connect(this.transport);
      console.log('✅ Connected to Sanity MCP Server via SSE!');
      console.log('🔗 Session-based connection established with unique session ID');

      return true;
    } catch (error) {
      console.error('❌ Failed to connect:', error.message);
      console.error('💡 Make sure the server is running and accessible at:', this.serverUrl);
      return false;
    }
  }

  async getServerInfo() {
    try {
      // Get server capabilities and information
      const result = await this.client.request(
        { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } } }
      );
      return result;
    } catch (error) {
      console.error('Error getting server info:', error);
      return null;
    }
  }

  async listTools() {
    try {
      const tools = await this.client.request({ method: 'tools/list', params: {} });
      return tools;
    } catch (error) {
      console.error('Error listing tools:', error);
      return null;
    }
  }

  async callTool(name, arguments_) {
    try {
      const result = await this.client.request({
        method: 'tools/call',
        params: {
          name: name,
          arguments: arguments_
        }
      });
      return result;
    } catch (error) {
      console.error(`Error calling tool ${name}:`, error);
      return null;
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      const health = await response.json();
      return health;
    } catch (error) {
      console.error('Error checking health:', error);
      return null;
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      console.log('Disconnected from server');
    }
  }
}

async function main() {
  const client = new SanityMCPClient();

  // Check if server is healthy
  console.log('🔍 Checking server health...');
  const health = await client.healthCheck();
  if (health) {
    console.log('Server status:', health);
  } else {
    console.log('❌ Server not responding. Make sure to start it with: npm run start:sse');
    return;
  }

  // Connect to server
  const connected = await client.connect();
  if (!connected) {
    return;
  }

  try {
    // Get initial context (required for Sanity MCP server)
    console.log('\n📋 Getting initial context...');
    const context = await client.callTool('get_initial_context', {});
    if (context) {
      console.log('Initial context retrieved successfully');
    }

    // List available tools
    console.log('\n🔧 Listing available tools...');
    const tools = await client.listTools();
    if (tools && tools.tools) {
      console.log(`Found ${tools.tools.length} tools:`);
      tools.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    }

    // Get Sanity configuration
    console.log('\n⚙️  Getting Sanity configuration...');
    const config = await client.callTool('get_sanity_config', {});
    if (config) {
      console.log('Sanity config:', JSON.stringify(config, null, 2));
    }

  } catch (error) {
    console.error('Error during demonstration:', error);
  } finally {
    await client.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

main().catch(console.error); 