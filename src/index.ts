#!/usr/bin/env node

/**
 * Yealink MCP Server
 * Model Context Protocol server for Yealink YMCS & RPS platform integration
 *
 * YMCS: Device management, site management, enterprise management
 * RPS:  Remote provisioning — register MAC addresses to provisioning URLs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { YMCSClient } from './ymcs-client.js';
import { RPSClient } from './rps-client.js';
import { MCPServerConfig } from './types/config.js';

const getConfig = (): MCPServerConfig => {
  const ymcsClientId = process.env.YMCS_CLIENT_ID;
  const ymcsClientSecret = process.env.YMCS_CLIENT_SECRET;
  const rpsUsername = process.env.RPS_USERNAME;
  const rpsPassword = process.env.RPS_PASSWORD;

  if (!ymcsClientId || !ymcsClientSecret) {
    throw new Error('YMCS_CLIENT_ID and YMCS_CLIENT_SECRET environment variables are required');
  }
  if (!rpsUsername || !rpsPassword) {
    throw new Error('RPS_USERNAME and RPS_PASSWORD environment variables are required');
  }

  return {
    name: 'yealink-mcp-server',
    version: '1.0.0',
    ymcs: {
      apiUrl: process.env.YMCS_API_URL || 'https://api-dm.yealink.com:8445',
      clientId: ymcsClientId,
      clientSecret: ymcsClientSecret,
      timeout: 30000
    },
    rps: {
      apiUrl: process.env.RPS_API_URL || 'https://rps.yealink.com',
      username: rpsUsername,
      password: rpsPassword,
      timeout: 15000
    },
    debug: process.env.DEBUG === 'true'
  };
};

const config = getConfig();

class YealinkMCPServer {
  private server: Server;
  private ymcs: YMCSClient;
  private rps: RPSClient;

  constructor() {
    this.server = new Server(
      { name: config.name, version: config.version },
      { capabilities: { tools: {} } }
    );
    this.ymcs = new YMCSClient(config.ymcs);
    this.rps = new RPSClient(config.rps);
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // ── YMCS Tools ──
        {
          name: 'ymcs_list_devices',
          description: 'List Yealink devices managed in YMCS. Filter by enterprise or site.',
          inputSchema: {
            type: 'object',
            properties: {
              enterpriseId: { type: 'string', description: 'Filter by enterprise ID' },
              siteId: { type: 'string', description: 'Filter by site ID' },
              pageNo: { type: 'number', description: 'Page number (default: 1)' },
              pageSize: { type: 'number', description: 'Results per page (default: 20, max: 100)' }
            }
          }
        },
        {
          name: 'ymcs_get_device',
          description: 'Get details for a specific Yealink device by MAC address.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address (any format, e.g. 00:15:65:xx:xx:xx)' }
            },
            required: ['mac']
          }
        },
        {
          name: 'ymcs_reboot_device',
          description: 'Send a remote reboot command to a Yealink device via YMCS.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' }
            },
            required: ['mac']
          }
        },
        {
          name: 'ymcs_add_device',
          description: 'Add/register a Yealink device to YMCS management.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' },
              enterpriseId: { type: 'string', description: 'Enterprise ID to add device to' },
              siteId: { type: 'string', description: 'Site ID (optional)' },
              description: { type: 'string', description: 'Device description (optional)' }
            },
            required: ['mac', 'enterpriseId']
          }
        },
        {
          name: 'ymcs_remove_device',
          description: 'Remove a Yealink device from YMCS management.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' }
            },
            required: ['mac']
          }
        },
        {
          name: 'ymcs_list_sites',
          description: 'List sites/locations in YMCS.',
          inputSchema: {
            type: 'object',
            properties: {
              enterpriseId: { type: 'string', description: 'Filter by enterprise ID' },
              pageNo: { type: 'number', description: 'Page number (default: 1)' },
              pageSize: { type: 'number', description: 'Results per page (default: 20)' }
            }
          }
        },
        {
          name: 'ymcs_get_site',
          description: 'Get details for a specific YMCS site.',
          inputSchema: {
            type: 'object',
            properties: {
              siteId: { type: 'string', description: 'Site ID' }
            },
            required: ['siteId']
          }
        },
        {
          name: 'ymcs_list_enterprises',
          description: 'List enterprises/accounts accessible via YMCS API credentials.',
          inputSchema: {
            type: 'object',
            properties: {
              pageNo: { type: 'number', description: 'Page number (default: 1)' },
              pageSize: { type: 'number', description: 'Results per page (default: 20)' }
            }
          }
        },
        // ── RPS Tools ──
        {
          name: 'rps_register_device',
          description: 'Register a Yealink device MAC address with a provisioning server URL in RPS. When a device boots, it will automatically redirect to the specified URL.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' },
              provisionUrl: { type: 'string', description: 'Provisioning server URL (e.g. https://provisioning.example.com/)' },
              username: { type: 'string', description: 'Provisioning server username (optional)' },
              password: { type: 'string', description: 'Provisioning server password (optional)' }
            },
            required: ['mac', 'provisionUrl']
          }
        },
        {
          name: 'rps_register_devices',
          description: 'Bulk register multiple Yealink device MAC addresses to provisioning URLs in RPS.',
          inputSchema: {
            type: 'object',
            properties: {
              devices: {
                type: 'array',
                description: 'Array of devices to register',
                items: {
                  type: 'object',
                  properties: {
                    mac: { type: 'string', description: 'Device MAC address' },
                    provisionUrl: { type: 'string', description: 'Provisioning server URL' },
                    username: { type: 'string', description: 'Provisioning server username (optional)' },
                    password: { type: 'string', description: 'Provisioning server password (optional)' }
                  },
                  required: ['mac', 'provisionUrl']
                }
              }
            },
            required: ['devices']
          }
        },
        {
          name: 'rps_check_device',
          description: 'Check the current RPS registration status and provisioning URL for a Yealink device.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' }
            },
            required: ['mac']
          }
        },
        {
          name: 'rps_delete_device',
          description: 'Remove/unregister a device from Yealink RPS.',
          inputSchema: {
            type: 'object',
            properties: {
              mac: { type: 'string', description: 'Device MAC address' }
            },
            required: ['mac']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // ── YMCS ──
          case 'ymcs_list_devices': {
            const result = await this.ymcs.listDevices(args as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_get_device': {
            if (!args?.mac) throw new McpError(ErrorCode.InvalidParams, 'mac is required');
            const result = await this.ymcs.getDevice(args.mac as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_reboot_device': {
            if (!args?.mac) throw new McpError(ErrorCode.InvalidParams, 'mac is required');
            const result = await this.ymcs.rebootDevice(args.mac as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_add_device': {
            if (!args?.mac || !args?.enterpriseId) throw new McpError(ErrorCode.InvalidParams, 'mac and enterpriseId are required');
            const result = await this.ymcs.addDevice(args as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_remove_device': {
            if (!args?.mac) throw new McpError(ErrorCode.InvalidParams, 'mac is required');
            const result = await this.ymcs.removeDevice(args.mac as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_list_sites': {
            const result = await this.ymcs.listSites(args as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_get_site': {
            if (!args?.siteId) throw new McpError(ErrorCode.InvalidParams, 'siteId is required');
            const result = await this.ymcs.getSite(args.siteId as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'ymcs_list_enterprises': {
            const result = await this.ymcs.listEnterprises(args as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          // ── RPS ──
          case 'rps_register_device': {
            if (!args?.mac || !args?.provisionUrl) throw new McpError(ErrorCode.InvalidParams, 'mac and provisionUrl are required');
            const result = await this.rps.registerDevice(args as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'rps_register_devices': {
            if (!args?.devices) throw new McpError(ErrorCode.InvalidParams, 'devices array is required');
            const result = await this.rps.registerDevices(args.devices as any);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'rps_check_device': {
            if (!args?.mac) throw new McpError(ErrorCode.InvalidParams, 'mac is required');
            const result = await this.rps.checkDevice(args.mac as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'rps_delete_device': {
            if (!args?.mac) throw new McpError(ErrorCode.InvalidParams, 'mac is required');
            const result = await this.rps.deleteDevice(args.mac as string);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${message}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    if (config.debug) {
      console.error('Yealink MCP Server running (YMCS + RPS)');
    }
  }
}

const server = new YealinkMCPServer();
server.run().catch(console.error);
