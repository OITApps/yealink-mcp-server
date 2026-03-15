# yealink-mcp-server

MCP server for Yealink YMCS (Management Cloud Service) and RPS (Remote Provisioning Service).

## Tools

### YMCS (Device Management)
| Tool | Description |
|------|-------------|
| `ymcs_list_devices` | List managed devices, filter by enterprise/site |
| `ymcs_get_device` | Get device details by MAC address |
| `ymcs_reboot_device` | Remote reboot a device |
| `ymcs_add_device` | Register a device to YMCS |
| `ymcs_remove_device` | Remove a device from YMCS |
| `ymcs_list_sites` | List sites/locations |
| `ymcs_get_site` | Get site details |
| `ymcs_list_enterprises` | List accessible enterprises |

### RPS (Remote Provisioning)
| Tool | Description |
|------|-------------|
| `rps_register_device` | Register MAC → provisioning URL |
| `rps_register_devices` | Bulk register MACs |
| `rps_check_device` | Check RPS registration status |
| `rps_delete_device` | Unregister device from RPS |

## Setup

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in credentials:

```
YMCS_CLIENT_ID=       # From YMCS portal: Enterprise > Open API
YMCS_CLIENT_SECRET=   # From YMCS portal: Enterprise > Open API
RPS_USERNAME=         # rps.yealink.com account
RPS_PASSWORD=         # rps.yealink.com account
```

## MCP Client Config

```json
{
  "mcpServers": {
    "yealink": {
      "command": "node",
      "args": ["/path/to/yealink-mcp-server/build/index.js"],
      "env": {
        "YMCS_CLIENT_ID": "your-client-id",
        "YMCS_CLIENT_SECRET": "your-client-secret",
        "RPS_USERNAME": "your-rps-username",
        "RPS_PASSWORD": "your-rps-password"
      }
    }
  }
}
```
