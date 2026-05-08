/**
 * api/workers.js
 * Worker node management REST API routes
 */
const express = require('express');
const JobStore = require('../scheduler/jobStore');
const logger = require('../logger');

const router = express.Router();

// GET /api/workers — list all known workers
router.get('/', (req, res) => {
  const workers = JobStore.getAllWorkers();
  res.json({ workers, total: workers.length });
});

// GET /api/workers/active — list currently active (heartbeating) workers
router.get('/active', (req, res) => {
  const workers = JobStore.getIdleWorkers();
  res.json({ workers, total: workers.length });
});

// GET /api/workers/:address — get single worker details
router.get('/:address', (req, res) => {
  const worker = JobStore.getWorker(req.params.address);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  res.json(worker);
});

// POST /api/workers/register — HTTP registration fallback (socket is preferred)
router.post('/register', (req, res) => {
  const { address, gpuName, vram, benchmarkScore } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });

  const worker = JobStore.registerWorker({ address, gpuName, vram, benchmarkScore });
  logger.info(`[Workers] Registered via HTTP: ${address}`);

  const io = req.app.get('io');
  if (io) {
    io.emit('network:stats', JobStore.getNetworkStats());
    io.emit('workers:list', JobStore.getAllWorkers());
  }

  res.status(201).json({ success: true, worker });
});

// POST /api/workers/:address/heartbeat — HTTP heartbeat fallback
router.post('/:address/heartbeat', (req, res) => {
  const { gpu, vram, usage, temperature, benchmarkScore, status } = req.body;
  let worker = JobStore.updateWorkerHeartbeat(req.params.address, {
    gpuName: gpu,
    vram,
    usage,
    temperature,
    benchmarkScore,
    status: status || 'idle',
    lastSeen: new Date().toISOString(),
  });

  let autoRegistered = false;
  if (!worker) {
    // Auto-register if not known
    worker = JobStore.registerWorker({
      address: req.params.address,
      gpuName: gpu || 'Unknown',
      vram: vram || 0,
      benchmarkScore: benchmarkScore || 0,
    });
    autoRegistered = true;
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('network:stats', JobStore.getNetworkStats());
    io.emit('workers:list', JobStore.getAllWorkers());
  }

  res.json({ success: true, worker, autoRegistered });
});

// GET /api/workers/network/stats — overall network statistics
router.get('/network/stats', (req, res) => {
  res.json(JobStore.getNetworkStats());
});

module.exports = router;
