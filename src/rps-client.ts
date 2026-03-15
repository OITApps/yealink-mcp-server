/**
 * Yealink RPS (Remote Provisioning Service) Client
 *
 * Protocol: XML-RPC over HTTPS
 * Base URL: https://rps.yealink.com
 * Docs: Yealink XML API for RPS Management Platform V3.4.x
 *
 * XML-RPC is implemented manually via axios to avoid additional dependencies.
 */

import axios from 'axios';
import { RPSConfig, RPSDevice } from './types/config.js';

export class RPSClient {
  private config: RPSConfig;

  constructor(config: RPSConfig) {
    this.config = config;
  }

  /**
   * Build an XML-RPC request body
   */
  private buildXmlRpcRequest(method: string, params: any[]): string {
    const serializeValue = (val: any): string => {
      if (typeof val === 'string') return `<value><string>${this.escapeXml(val)}</string></value>`;
      if (typeof val === 'number') return `<value><int>${val}</int></value>`;
      if (typeof val === 'boolean') return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
      if (Array.isArray(val)) {
        const items = val.map(v => `<value>${serializeValue(v)}</value>`).join('');
        return `<value><array><data>${items}</data></array></value>`;
      }
      if (typeof val === 'object' && val !== null) {
        const members = Object.entries(val).map(([k, v]) =>
          `<member><name>${this.escapeXml(k)}</name>${serializeValue(v)}</member>`
        ).join('');
        return `<value><struct>${members}</struct></value>`;
      }
      return `<value><string>${String(val)}</string></value>`;
    };

    const paramXml = params.map(p => `<param>${serializeValue(p)}</param>`).join('');
    return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Parse XML-RPC response — returns the fault string or the first param value (simplified)
   */
  private parseXmlRpcResponse(xml: string): { fault: boolean; value: any; faultString?: string } {
    if (xml.includes('<fault>')) {
      const faultMatch = xml.match(/<faultString><\/faultString>|<string>([^<]*)<\/string>/);
      return { fault: true, value: null, faultString: faultMatch?.[1] || 'RPS fault response' };
    }
    // Extract first string value from response for simple success/error cases
    const valueMatch = xml.match(/<string>([^<]*)<\/string>/);
    return { fault: false, value: valueMatch?.[1] || 'OK' };
  }

  private async call(method: string, params: any[]): Promise<{ fault: boolean; value: any; faultString?: string }> {
    const body = this.buildXmlRpcRequest(method, params);
    const response = await axios.post(
      `${this.config.apiUrl}/redirect`,
      body,
      {
        headers: { 'Content-Type': 'text/xml' },
        timeout: this.config.timeout || 15000
      }
    );
    return this.parseXmlRpcResponse(response.data);
  }

  // ── RPS API Methods ──────────────────────────────────────────────

  /**
   * Register a single device MAC with a provisioning server URL
   */
  async registerDevice(params: {
    mac: string;
    provisionUrl: string;
    username?: string;
    password?: string;
  }): Promise<{ success: boolean; message: string }> {
    const mac = params.mac.replace(/[:-]/g, '').toUpperCase();
    const result = await this.call('redirect.registerDevice', [
      this.config.username,
      this.config.password,
      mac,
      params.provisionUrl,
      params.username || '',
      params.password || ''
    ]);
    return {
      success: !result.fault,
      message: result.fault ? (result.faultString || 'Registration failed') : 'Device registered successfully'
    };
  }

  /**
   * Bulk register multiple devices
   */
  async registerDevices(devices: Array<{
    mac: string;
    provisionUrl: string;
    username?: string;
    password?: string;
  }>): Promise<{ success: boolean; message: string; registered: number }> {
    const deviceList = devices.map(d => ({
      mac: d.mac.replace(/[:-]/g, '').toUpperCase(),
      provisionUrl: d.provisionUrl,
      username: d.username || '',
      password: d.password || ''
    }));

    const result = await this.call('redirect.registerDevices', [
      this.config.username,
      this.config.password,
      deviceList
    ]);

    return {
      success: !result.fault,
      message: result.fault ? (result.faultString || 'Bulk registration failed') : 'Devices registered successfully',
      registered: result.fault ? 0 : devices.length
    };
  }

  /**
   * Check a device's current RPS registration
   */
  async checkDevice(mac: string): Promise<RPSDevice | null> {
    const normalizedMac = mac.replace(/[:-]/g, '').toUpperCase();
    const result = await this.call('redirect.checkDeviceExt', [
      this.config.username,
      this.config.password,
      normalizedMac
    ]);

    if (result.fault) return null;
    // Response value contains device info as XML struct; return raw for now
    return { mac: normalizedMac, status: 'registered', provisionUrl: result.value };
  }

  /**
   * Delete/unregister a device from RPS
   */
  async deleteDevice(mac: string): Promise<{ success: boolean; message: string }> {
    const normalizedMac = mac.replace(/[:-]/g, '').toUpperCase();
    const result = await this.call('redirect.deleteDevice', [
      this.config.username,
      this.config.password,
      normalizedMac
    ]);
    return {
      success: !result.fault,
      message: result.fault ? (result.faultString || 'Delete failed') : 'Device unregistered from RPS'
    };
  }
}
