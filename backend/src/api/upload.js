/**
 * api/upload.js
 * POST /api/upload — Accept Blender file, encrypt it, upload to IPFS, create a job
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const EncryptionManager = require('../encryption/manager');
const pinata = require('../ipfs/pinata');
const JobStore = require('../scheduler/jobStore');
const CostEstimator = require('../scheduler/costEstimator');
const logger = require('../logger');

const router = express.Router();

// Ensure upload dir exists
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

// Multer config — store raw uploads in uploads/ dir
const storage = multer.diskStorage({
  destination: config.UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.blend', '.zip', '.tar', '.gz'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}. Only .blend files are accepted.`));
    }
  },
});

/**
 * POST /api/upload
 * Body (multipart/form-data):
 *   - file: Blender project file (.blend)
 *   - startFrame: number (default 1)
 *   - endFrame: number (default 1)
 *   - resolution: string (default "1920x1080")
 *   - samples: number (default 128)
 *   - exportFormat: string (default "mp4")
 *   - creatorWallet: string (optional)
 */
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please attach a .blend file.' });
  }

  const rawFilePath = req.file.path;
  const {
    startFrame = 1,
    endFrame = 1,
    resolution = '1920x1080',
    samples = 128,
    exportFormat = 'mp4',
    creatorWallet = 'anonymous',
  } = req.body;

  const start = parseInt(startFrame);
  const end = parseInt(endFrame);
  const sampleCount = parseInt(samples);
  const frameCount = end - start + 1;

  logger.info(`[Upload] Received ${req.file.originalname} | Frames ${start}-${end} | ${resolution} | ${sampleCount} samples`);

  try {
    // 1. Generate per-job encryption key
    const encryptionKey = EncryptionManager.generateJobKey();

    // 2. Encrypt the blend file
    const encryptedPath = rawFilePath + '.enc';
    const ok = EncryptionManager.encryptFile(rawFilePath, encryptedPath, encryptionKey);
    if (!ok) throw new Error('Encryption failed');

    // 3. Upload encrypted file to Pinata IPFS
    const assetCid = await pinata.uploadFile(encryptedPath, `job_${uuidv4()}.blend.enc`);
    if (!assetCid) throw new Error('IPFS upload failed — check Pinata credentials');

    // 4. Estimate cost & process user-customized reward rates
    const speedPriority = req.body.speedPriority || 'standard';
    const userRewardEth = req.body.rewardEth ? parseFloat(req.body.rewardEth) : null;

    const estimate = CostEstimator.estimate({ frameCount, resolution, samples: sampleCount });
    const finalRewardEth = userRewardEth !== null && !isNaN(userRewardEth) ? userRewardEth : estimate.estimatedCostEth;

    // 5. Create job in store with initial status 'pending_escrow'
    const job = JobStore.createJob({
      creatorWallet,
      assetCid,
      encryptionKey,
      totalFrames: frameCount,
      startFrame: start,
      endFrame: end,
      resolution,
      samples: sampleCount,
      rewardEth: finalRewardEth,
      speedPriority,
      exportFormat,
      status: 'pending_escrow',
    });

    // 6. Save encrypted file in local cache for instant worker download fallback
    const cachedEncPath = path.join(config.UPLOAD_DIR, `cache_${assetCid}.blend.enc`);
    fs.copyFileSync(encryptedPath, cachedEncPath);

    // Cleanup raw files
    fs.unlinkSync(rawFilePath);
    fs.unlinkSync(encryptedPath);

    logger.info(`[Upload] Job ${job.id} created. CID: ${assetCid} (Cached locally: ${cachedEncPath})`);

    return res.status(201).json({
      success: true,
      jobId: job.id,
      assetCid,
      estimate,
      message: 'File encrypted, uploaded to IPFS, and job queued successfully.',
    });
  } catch (err) {
    logger.error(`[Upload] Error: ${err.message}`);
    // Cleanup on failure
    if (fs.existsSync(rawFilePath)) fs.unlinkSync(rawFilePath);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
