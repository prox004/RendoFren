/**
 * api/auth.js
 * API Key management and Worker Authentication
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const router = express.Router();
const KEY_STORE_PATH = path.join(__dirname, '../../data/keys.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, '../../data'))) {
  fs.mkdirSync(path.join(__dirname, '../../data'), { recursive: true });
}

// Load or init keys
function loadKeys() {
  if (!fs.existsSync(KEY_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(KEY_STORE_PATH, 'utf8'));
}

function saveKeys(keys) {
  fs.writeFileSync(KEY_STORE_PATH, JSON.stringify(keys, null, 2));
}

// POST /api/auth/generate-key — Generate a key for a user (Privy ID or Wallet)
router.post('/generate-key', (req, res) => {
  const { userId, address, email } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const apiKey = `rf_${crypto.randomBytes(24).toString('hex')}`;
  const keys = loadKeys();
  
  keys[apiKey] = {
    userId,
    address,
    email,
    createdAt: new Date().toISOString(),
  };

  saveKeys(keys);
  logger.info(`[Auth] Generated new API key for ${email || address || userId}`);
  res.json({ apiKey });
});

// GET /api/auth/me — Fetch account details via API Key
router.get('/me', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key missing' });

  const keys = loadKeys();
  const userData = keys[apiKey];

  if (!userData) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  res.json({
    ...userData,
    readonly: true, // Details are for view only
    system: 'RendoFren Network'
  });
});

module.exports = router;
