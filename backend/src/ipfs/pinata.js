/**
 * ipfs/pinata.js
 * Pinata IPFS upload client — uploads encrypted blends and render outputs
 */
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');  // built into Node 18+, axios handles it
const path = require('path');
const config = require('../config');
const logger = require('../logger');

class PinataClient {
  constructor() {
    this.jwt = config.PINATA_JWT;
    this.apiKey = config.PINATA_API_KEY;
    this.apiSecret = config.PINATA_API_SECRET;
    this.baseUrl = 'https://api.pinata.cloud';
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.jwt}`,
    };
  }

  /**
   * Upload a file from disk to Pinata IPFS
   * Returns the CID string on success, null on failure
   */
  async uploadFile(filePath, name = null) {
    const fileName = name || path.basename(filePath);
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), { filename: fileName });
      form.append(
        'pinataMetadata',
        JSON.stringify({ name: `rendofren_${fileName}` })
      );
      form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const response = await axios.post(`${this.baseUrl}/pinning/pinFileToIPFS`, form, {
        headers: { ...this.headers, ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
      });

      const cid = response.data.IpfsHash;
      logger.info(`[IPFS] Uploaded ${fileName} → CID: ${cid}`);
      return cid;
    } catch (err) {
      logger.error(`[IPFS] Upload failed for ${fileName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Upload a raw Buffer to Pinata IPFS
   * Returns CID string or null
   */
  async uploadBuffer(buffer, fileName) {
    try {
      const form = new FormData();
      form.append('file', buffer, { filename: fileName });
      form.append('pinataMetadata', JSON.stringify({ name: `rendofren_${fileName}` }));
      form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const response = await axios.post(`${this.baseUrl}/pinning/pinFileToIPFS`, form, {
        headers: { ...this.headers, ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
      });

      const cid = response.data.IpfsHash;
      logger.info(`[IPFS] Buffer uploaded as ${fileName} → CID: ${cid}`);
      return cid;
    } catch (err) {
      logger.error(`[IPFS] Buffer upload failed for ${fileName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Test connectivity to Pinata
   */
  async testAuthentication() {
    try {
      const res = await axios.get(`${this.baseUrl}/data/testAuthentication`, {
        headers: this.headers,
        timeout: 8000,
      });
      return res.data.message === 'Congratulations! You are communicating with the Pinata API!';
    } catch {
      return false;
    }
  }

  /**
   * Get public gateway URL for a CID
   */
  getGatewayUrl(cid) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
}

module.exports = new PinataClient();
