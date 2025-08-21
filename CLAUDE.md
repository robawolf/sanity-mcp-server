# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
- `npm run build` - Compile TypeScript to JavaScript in `/build` directory 
- `npm run dev` - Run TypeScript compiler in watch mode for development
- `npm run test` - Run tests with Vitest
- `npm run test:run` - Run tests once without watch mode

### Code Quality
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Run ESLint with automatic fixes
- `npm run format` - Format code with Prettier

### Running the Server
- `node build/index.js` - Run the built MCP server
- For debugging: Use MCP inspector with environment variables

## Architecture Overview

This is a Model Context Protocol (MCP) server that provides AI tools access to Sanity CMS operations.

### Core Structure

**Entry Point (`src/index.ts`)**: 
- Initializes McpServer with tools, prompts, and resources
- Uses StdioServerTransport for communication
- Registers tools based on user role (developer/editor/internal_agent_role)

**Tool Registration (`src/tools/register.ts`)**:
- Role-based tool access via proxy pattern
- Middleware enforcement for context initialization
- Three user roles with different tool sets:
  - `developer`: Full access to all tools
  - `editor`: Content-focused tools without project administration  
  - `internal_agent_role`: Subset for automated operations

### Tool Categories

Tools are organized in modules under `src/tools/`:

- **Context** (`context/`): Initial setup and configuration tools
- **Documents** (`documents/`): CRUD operations, publishing, versioning, translations
- **Datasets** (`datasets/`): Dataset management operations
- **Releases** (`releases/`): Release planning and publishing workflows
- **Projects** (`projects/`): Project and studio information
- **Schema** (`schema/`): Content type definitions and validation
- **Embeddings** (`embeddings/`): Semantic search capabilities
- **GROQ** (`groq/`): Query language support

### Environment Configuration

Configuration handled via Zod schemas in `src/config/env.ts`:

**Required Variables**:
- `SANITY_API_TOKEN`: API authentication
- `SANITY_PROJECT_ID`: Target project ID  
- `SANITY_DATASET`: Dataset name
- `MCP_USER_ROLE`: Controls tool access level

**Optional Variables**:
- `SANITY_API_HOST`: API endpoint (defaults to https://api.sanity.io)
- `MAX_TOOL_TOKEN_OUTPUT`: Response size limit (default 50000)

### Key Patterns

- **Middleware Architecture**: Context enforcement via proxy pattern prevents tool usage without initialization
- **Role-Based Access**: Tools registered conditionally based on user role
- **Type Safety**: Extensive use of Zod for runtime validation and TypeScript for compile-time safety
- **Modular Tools**: Each tool category has its own registration function and types

### Important Implementation Details

- All tools require `get_initial_context` to be called first due to middleware
- Tools are wrapped with context checking proxy in register.ts:16-38
- The server uses ES modules (type: "module" in package.json)
- TypeScript compiled with Node16 module resolution for proper ESM support