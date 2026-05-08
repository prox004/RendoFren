/**
 * api/blockchain.js
 * REST API routes for mock blockchain transaction ledger
 */
const express = require('express');
const blockchain = require('../blockchain/blockchain');

const router = express.Router();

// GET /api/blockchain/stats
router.get('/stats', async (req, res) => {
  res.json(await blockchain.getStats());
});

// GET /api/blockchain/logs
router.get('/logs', (req, res) => {
  res.json(blockchain.getLogs());
});

// GET /api/blockchain/rewards/:address
router.get('/rewards/:address', async (req, res) => {
  try {
    const rewards = await blockchain.getWorkerRewards(req.params.address);
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
