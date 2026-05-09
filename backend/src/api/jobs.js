/**
 * api/jobs.js
 * Job management REST API routes
 */
const express = require('express');
const JobStore = require('../scheduler/jobStore');
const CostEstimator = require('../scheduler/costEstimator');
const logger = require('../logger');

const router = express.Router();

// GET /api/jobs — list all jobs (latest first)
router.get('/', (req, res) => {
  const jobs = JobStore.getAllJobs();
  res.json({ jobs, total: jobs.length });
});

// GET /api/jobs/:id — get single job details
router.get('/:id', (req, res) => {
  const job = JobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/jobs/download/:cid — high speed instant download fallback/proxy for workers
router.get('/download/:cid', async (req, res) => {
  const { cid } = req.params;
  const config = require('../config');
  const path = require('path');
  const fs = require('fs');
  const axios = require('axios');

  const cachedPath = path.join(config.UPLOAD_DIR, `cache_${cid}.blend.enc`);

  // Serve from local high-speed cache if exists
  if (fs.existsSync(cachedPath)) {
    logger.info(`[Jobs] Serving CID ${cid} from local cache.`);
    return res.download(cachedPath, `cache_${cid}.blend.enc`);
  }

  // Fallback: proxy from Pinata IPFS gateway
  logger.info(`[Jobs] Serving CID ${cid} via IPFS proxy.`);
  const pinata = require('../ipfs/pinata');
  const gatewayUrl = pinata.getGatewayUrl(cid);
  
  try {
    const response = await axios({
      method: 'get',
      url: gatewayUrl,
      responseType: 'stream',
      timeout: 60000,
    });
    res.setHeader('Content-Disposition', `attachment; filename="${cid}.enc"`);
    response.data.pipe(res);
  } catch (err) {
    logger.error(`[Jobs] Failed to proxy CID ${cid} from IPFS: ${err.message}`);
    res.status(502).json({ error: `Could not retrieve file from IPFS: ${err.message}` });
  }
});

// POST /api/jobs/:id/claim — worker claims a job
router.post('/:id/claim', (req, res) => {
  const { workerAddress } = req.body;
  if (!workerAddress) return res.status(400).json({ error: 'workerAddress required' });

  const job = JobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'pending' && job.status !== 'queued') {
    return res.status(409).json({ error: `Job is not claimable (status: ${job.status})` });
  }
  
  // Anti-Poaching Guard: If the dispatcher specifically assigned this job to a node,
  // do not let a different node steal it via HTTP polling.
  if (job.assignedWorker && job.assignedWorker !== workerAddress && job.assignedWorker !== 'Swarm Network') {
    return res.status(403).json({ error: `Job is explicitly reserved for worker ${job.assignedWorker}` });
  }

  JobStore.markRendering(req.params.id, workerAddress);
  logger.info(`[Jobs] Job ${req.params.id} claimed by worker ${workerAddress}`);
  res.json({ success: true, job: JobStore.getJob(req.params.id) });
});

// POST /api/jobs/:id/complete — worker reports completion
router.post('/:id/complete', async (req, res) => {
  const { workerAddress, resultCid } = req.body;
  if (!workerAddress || !resultCid) {
    return res.status(400).json({ error: 'workerAddress and resultCid required' });
  }

  const job = JobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const dispatcher = req.app.get('dispatcher');
  if (dispatcher) {
    await dispatcher.handleJobCompletion(req.params.id, workerAddress, resultCid);
  } else {
    JobStore.markDone(req.params.id, resultCid);
  }

  logger.info(`[Jobs] Job ${req.params.id} completed by ${workerAddress}. CID: ${resultCid}`);
  res.json({ success: true, job: JobStore.getJob(req.params.id) });
});

// POST /api/jobs/:id/fail — worker reports failure
router.post('/:id/fail', async (req, res) => {
  const { workerAddress, error } = req.body;
  const job = JobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const dispatcher = req.app.get('dispatcher');
  if (dispatcher) {
    await dispatcher.handleJobFailure(req.params.id, workerAddress, error || 'Unknown error');
  } else {
    JobStore.markFailed(req.params.id, error || 'Unknown error');
  }

  logger.warn(`[Jobs] Job ${req.params.id} failed: ${error}`);
  res.json({ success: true });
});

// POST /api/jobs/estimate — estimate cost without creating a job
router.post('/estimate', (req, res) => {
  const { frameCount = 1, resolution = '1920x1080', samples = 128, benchmarkScore = 300 } = req.body;
  const estimate = CostEstimator.estimate({
    frameCount: parseInt(frameCount),
    resolution,
    samples: parseInt(samples),
    benchmarkScore: parseInt(benchmarkScore),
  });
  res.json(estimate);
});

// DELETE /api/jobs/:id — remove a job
router.delete('/:id', (req, res) => {
  const existed = JobStore.deleteJob(req.params.id);
  if (!existed) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true });
});

// POST /api/jobs/:id/confirm-escrow — Client confirms escrow deposit
router.post('/:id/confirm-escrow', async (req, res) => {
  const { txHash } = req.body;
  if (!txHash) return res.status(400).json({ error: 'txHash is required to confirm escrow.' });

  const job = JobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status !== 'pending_escrow') {
    return res.status(400).json({ error: `Job escrow is already confirmed or cannot be modified (current status: ${job.status})` });
  }

  // Update job status to 'pending' to activate it in the rendering dispatch queue!
  JobStore.updateJob(job.id, {
    status: 'pending',
    txHash: txHash
  });

  // Lock on-chain Escrow (logging in backend database logs)
  try {
    const BlockchainManager = require('../blockchain/blockchain');
    await BlockchainManager.logDeposit(job.id, job.creatorWallet, job.rewardEth, job.assetCid, txHash);
  } catch (err) {
    logger.error(`[Jobs] Failed to log escrow deposit in BlockchainManager: ${err.message}`);
  }

  logger.info(`[Jobs] Escrow deposit confirmed for Job ${job.id} | TX Hash: ${txHash}`);
  res.json({ success: true, job: JobStore.getJob(job.id) });
});

module.exports = router;
