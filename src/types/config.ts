/**
 * Configuration types for Yealink MCP Server
 */

export interface YMCSConfig {
  /** YMCS API base URL */
  apiUrl: string;
  /** OAuth2 Client ID */
  clientId: string;
  /** OAuth2 Client Secret */
  clientSecret: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface RPSConfig {
  /** RPS API base URL */
  apiUrl: string;
  /** RPS account username */
  username: string;
  /** RPS account password */
  password: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  ymcs: YMCSConfig;
  rps: RPSConfig;
  debug?: boolean;
}

// YMCS Types
export interface YMCSDevice {
  deviceId?: string;
  mac: string;
  model?: string;
  firmwareVersion?: string;
  status?: string;
  siteId?: string;
  siteName?: string;
  enterpriseId?: string;
  lastOnline?: string;
  ipAddress?: string;
}

export interface YMCSSite {
  siteId: string;
  siteName: string;
  enterpriseId?: string;
  description?: string;
  country?: string;
  timezone?: string;
}

export interface YMCSEnterprise {
  enterpriseId: string;
  enterpriseName: string;
  status?: string;
  deviceCount?: number;
  siteCount?: number;
}

export interface YMCSApiResponse<T = any> {
  ret?: string;
  msg?: string;
  data?: T;
  total?: number;
}

// RPS Types
export interface RPSDevice {
  mac: string;
  provisionUrl?: string;
  username?: string;
  password?: string;
  status?: string;
}
