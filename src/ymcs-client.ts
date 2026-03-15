/**
 * Yealink YMCS (Management Cloud Service) REST API Client
 *
 * Authentication: OAuth2 client_credentials flow
 * Base URL: https://api-dm.yealink.com:8445
 * Docs: https://support.yealink.com/document-detail/c0966bbacb51405397c55290c2925f65
 */

import axios, { AxiosInstance } from 'axios';
import { YMCSConfig, YMCSDevice, YMCSSite, YMCSEnterprise, YMCSApiResponse } from './types/config.js';

export class YMCSClient {
  private client: AxiosInstance;
  private config: YMCSConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: YMCSConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.apiUrl}/api/open/v1`,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'User-Agent': 'Yealink-MCP-Server/1.0.0'
      }
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('YMCS API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Obtain OAuth2 access token via client_credentials grant
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const nonce = Math.floor(Math.random() * 0xFFFFFFFF).toString();
    const timestamp = Date.now().toString();
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await axios.post(
      `${this.config.apiUrl}/v2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'timestamp': timestamp,
          'nonce': nonce
        },
        timeout: this.config.timeout || 30000
      }
    );

    this.accessToken = response.data.access_token;
    // Tokens typically expire in 7200 seconds; refresh 60s early
    this.tokenExpiry = Date.now() + ((response.data.expires_in || 7200) - 60) * 1000;
    return this.accessToken!;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { 'Authorization': `Bearer ${token}` };
  }

  // ── Device Management ────────────────────────────────────────────

  /**
   * List all devices for an enterprise
   */
  async listDevices(params: {
    enterpriseId?: string;
    siteId?: string;
    pageNo?: number;
    pageSize?: number;
  } = {}): Promise<{ devices: YMCSDevice[]; total: number }> {
    const headers = await this.authHeaders();
    const response = await this.client.get<YMCSApiResponse<YMCSDevice[]>>('/manager/device/list', {
      headers,
      params: {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 20,
        ...params.enterpriseId && { enterpriseId: params.enterpriseId },
        ...params.siteId && { siteId: params.siteId }
      }
    });
    return {
      devices: response.data.data || [],
      total: response.data.total || 0
    };
  }

  /**
   * Get details for a single device by MAC address
   */
  async getDevice(mac: string): Promise<YMCSDevice | null> {
    const headers = await this.authHeaders();
    const response = await this.client.get<YMCSApiResponse<YMCSDevice>>('/manager/device/info', {
      headers,
      params: { mac: mac.replace(/[:-]/g, '').toUpperCase() }
    });
    return response.data.data || null;
  }

  /**
   * Reboot a device by MAC address
   */
  async rebootDevice(mac: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.authHeaders();
    const response = await this.client.post<YMCSApiResponse>(
      '/manager/device/reboot',
      { mac: mac.replace(/[:-]/g, '').toUpperCase() },
      { headers }
    );
    return {
      success: response.data.ret === '0',
      message: response.data.msg || 'Reboot command sent'
    };
  }

  /**
   * Add/register a device to YMCS
   */
  async addDevice(params: {
    mac: string;
    enterpriseId: string;
    siteId?: string;
    description?: string;
  }): Promise<{ success: boolean; message: string }> {
    const headers = await this.authHeaders();
    const response = await this.client.post<YMCSApiResponse>(
      '/manager/device/add',
      {
        mac: params.mac.replace(/[:-]/g, '').toUpperCase(),
        enterpriseId: params.enterpriseId,
        ...params.siteId && { siteId: params.siteId },
        ...params.description && { description: params.description }
      },
      { headers }
    );
    return {
      success: response.data.ret === '0',
      message: response.data.msg || 'Device added'
    };
  }

  /**
   * Remove a device from YMCS
   */
  async removeDevice(mac: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.authHeaders();
    const response = await this.client.post<YMCSApiResponse>(
      '/manager/device/delete',
      { mac: mac.replace(/[:-]/g, '').toUpperCase() },
      { headers }
    );
    return {
      success: response.data.ret === '0',
      message: response.data.msg || 'Device removed'
    };
  }

  // ── Site Management ──────────────────────────────────────────────

  /**
   * List sites for an enterprise
   */
  async listSites(params: {
    enterpriseId?: string;
    pageNo?: number;
    pageSize?: number;
  } = {}): Promise<{ sites: YMCSSite[]; total: number }> {
    const headers = await this.authHeaders();
    const response = await this.client.get<YMCSApiResponse<YMCSSite[]>>('/manager/site/list', {
      headers,
      params: {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 20,
        ...params.enterpriseId && { enterpriseId: params.enterpriseId }
      }
    });
    return {
      sites: response.data.data || [],
      total: response.data.total || 0
    };
  }

  /**
   * Get a single site by ID
   */
  async getSite(siteId: string): Promise<YMCSSite | null> {
    const headers = await this.authHeaders();
    const response = await this.client.get<YMCSApiResponse<YMCSSite>>('/manager/site/info', {
      headers,
      params: { siteId }
    });
    return response.data.data || null;
  }

  // ── Enterprise / Account Management ─────────────────────────────

  /**
   * List enterprises accessible via the API credentials
   */
  async listEnterprises(params: {
    pageNo?: number;
    pageSize?: number;
  } = {}): Promise<{ enterprises: YMCSEnterprise[]; total: number }> {
    const headers = await this.authHeaders();
    const response = await this.client.get<YMCSApiResponse<YMCSEnterprise[]>>('/manager/enterprise/list', {
      headers,
      params: {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 20
      }
    });
    return {
      enterprises: response.data.data || [],
      total: response.data.total || 0
    };
  }
}
