/**
 * scheduler/jobStore.js
 * In-memory job store (with Upstash Redis persistence option)
 * Manages job lifecycle: pending → queued → rendering → assembling → done / failed
 */
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

// Persistence path
const DATA_FILE = process.env.DATA_FILE_PATH || path.join(__dirname, '../../data.json');

// In-memory store for hackathon speed
let jobs = new Map();
let workers = new Map();

// Helper to save data to disk
function saveToDisk() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      jobs: Array.from(jobs.entries()),
      workers: Array.from(workers.entries()),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error(`[JobStore] Failed to save data to disk: ${err.message}`);
  }
}

// Helper to load data from disk
function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      jobs = new Map(data.jobs || []);
      workers = new Map(data.workers || []);
      
      // Reset worker status to offline on startup
      for (const [address, worker] of workers.entries()) {
        worker.status = 'offline';
        workers.set(address, worker);
      }
      
      logger.info(`[JobStore] Loaded ${jobs.size} jobs and ${workers.size} workers from disk`);
    }
  } catch (err) {
    logger.error(`[JobStore] Failed to load data from disk: ${err.message}`);
  }
}

// Initial load
loadFromDisk();

class JobStore {
  // ─────────────────────────────── JOBS ────────────────────────────────

  static createJob({ creatorWallet, assetCid, encryptionKey, totalFrames, startFrame, endFrame, resolution, samples, rewardEth, speedPriority, exportFormat, status }) {
    const id = uuidv4();
    const job = {
      id,
      creatorWallet: creatorWallet || 'anonymous',
      assetCid,
      encryptionKey,
      totalFrames: totalFrames || (endFrame - startFrame + 1),
      startFrame: startFrame || 1,
      endFrame: endFrame || 1,
      resolution: resolution || '1920x1080',
      samples: samples || 128,
      rewardEth: rewardEth || 0.001,
      speedPriority: speedPriority || 'standard',
      exportFormat: exportFormat || 'mp4',
      status: status || 'pending',          // pending_escrow | pending | queued | rendering | assembling | done | failed
      progress: 0,                // 0-100
      segments: [],               // assigned frame segments
      renderedFrames: [],         // completed frame CIDs
      assignedWorker: null,
      resultCid: null,
      exportUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };
    jobs.set(id, job);
    saveToDisk();
    logger.info(`[JobStore] Created job ${id} | Frames ${startFrame}-${endFrame} | Reward ${rewardEth} ETH | Priority ${speedPriority}`);
    return job;
  }

  static getJob(id) {
    return jobs.get(id) || null;
  }

  static getAllJobs() {
    return Array.from(jobs.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static getPendingJobs() {
    return Array.from(jobs.values())
      .filter(j => j.status === 'pending')
      .sort((a, b) => {
        // 1. Sort by speed priority first: turbo (3) > standard (2) > eco (1)
        const priorityScore = (p) => p === 'turbo' ? 3 : (p === 'eco' ? 1 : 2);
        const scoreA = priorityScore(a.speedPriority);
        const scoreB = priorityScore(b.speedPriority);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        // 2. Tie breaker: Sort by reward density descending (reward per frame)
        const densityA = (a.rewardEth || 0) / (a.totalFrames || 1);
        const densityB = (b.rewardEth || 0) / (b.totalFrames || 1);
        if (Math.abs(densityB - densityA) > 1e-9) {
          return densityB - densityA;
        }

        // 3. Last tie breaker: oldest first (FIFO)
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
  }

  static updateJob(id, updates) {
    const job = jobs.get(id);
    if (!job) return null;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    jobs.set(id, job);
    saveToDisk();
    return job;
  }

  static updateProgress(id, progress) {
    return JobStore.updateJob(id, { progress: Math.min(100, Math.max(0, progress)) });
  }

  static markQueued(id) {
    return JobStore.updateJob(id, { status: 'queued' });
  }

  static markRendering(id, workerAddress) {
    return JobStore.updateJob(id, { status: 'rendering', assignedWorker: workerAddress });
  }

  static markAssembling(id) {
    return JobStore.updateJob(id, { status: 'assembling', progress: 90 });
  }

  static markDone(id, resultCid, exportUrl = null) {
    return JobStore.updateJob(id, {
      status: 'done',
      progress: 100,
      resultCid,
      exportUrl,
      completedAt: new Date().toISOString(),
    });
  }

  static markFailed(id, errorMsg) {
    return JobStore.updateJob(id, { status: 'failed', error: errorMsg });
  }

  static addRenderedFrame(id, frameCid) {
    const job = jobs.get(id);
    if (!job) return;
    job.renderedFrames.push(frameCid);
    job.progress = Math.floor((job.renderedFrames.length / job.totalFrames) * 85);
    job.updatedAt = new Date().toISOString();
    jobs.set(id, job);
    saveToDisk();
  }

  static deleteJob(id) {
    const deleted = jobs.delete(id);
    if (deleted) saveToDisk();
    return deleted;
  }

  // ─────────────────────────────── WORKERS ─────────────────────────────

  static registerWorker({ address, gpuName, vram, benchmarkScore, status = 'idle' }) {
    let normalizedStatus = 'idle';
    if (status) {
      const s = status.toLowerCase();
      if (s.includes('render') || s.includes('claim')) {
        normalizedStatus = 'rendering';
      } else if (s.includes('offline')) {
        normalizedStatus = 'offline';
      }
    }

    const existingWorker = workers.get(address);

    const worker = {
      address,
      gpuName: gpuName || (existingWorker ? existingWorker.gpuName : 'Unknown GPU'),
      vram: vram || (existingWorker ? existingWorker.vram : 0),
      benchmarkScore: benchmarkScore || (existingWorker ? existingWorker.benchmarkScore : 0),
      status: normalizedStatus,           // idle | rendering | offline
      currentJobId: existingWorker ? existingWorker.currentJobId : null,
      completedJobs: existingWorker ? existingWorker.completedJobs : 0,
      totalEarnings: existingWorker ? existingWorker.totalEarnings : 0,
      lastSeen: new Date().toISOString(),
      registeredAt: existingWorker ? existingWorker.registeredAt : new Date().toISOString(),
    };
    workers.set(address, worker);
    saveToDisk();
    logger.info(`[JobStore] Worker registered/re-connected: ${address} | GPU: ${worker.gpuName} | Score: ${worker.benchmarkScore} | Preserved Completed Jobs: ${worker.completedJobs}`);
    return worker;
  }

  static updateWorkerHeartbeat(address, stats) {
    const w = workers.get(address);
    if (!w) return null;

    let normalizedStatus = 'idle';
    if (stats.status) {
      const s = stats.status.toLowerCase();
      if (s.includes('render') || s.includes('claim')) {
        normalizedStatus = 'rendering';
      } else if (s.includes('offline')) {
        normalizedStatus = 'offline';
      }
    }

    const updatedStats = { ...stats };
    if (stats.status !== undefined) {
      updatedStats.status = normalizedStatus;
    }

    Object.assign(w, updatedStats, { lastSeen: new Date().toISOString() });
    workers.set(address, w);
    saveToDisk();
    return w;
  }

  static getWorker(address) {
    return workers.get(address) || null;
  }

  static getIdleWorkers() {
    const cutoff = Date.now() - 30000; // 30s timeout
    return Array.from(workers.values()).filter(
      w => w.status === 'idle' && new Date(w.lastSeen).getTime() > cutoff
    );
  }

  static getAllWorkers() {
    return Array.from(workers.values());
  }

  static getNetworkStats() {
    const allWorkers = Array.from(workers.values());
    const allJobs = Array.from(jobs.values());
    const cutoff = Date.now() - 30000;
    return {
      totalWorkers: allWorkers.length,
      activeWorkers: allWorkers.filter(w => new Date(w.lastSeen).getTime() > cutoff).length,
      idleWorkers: allWorkers.filter(w => w.status === 'idle' && new Date(w.lastSeen).getTime() > cutoff).length,
      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter(j => j.status === 'pending').length,
      activeJobs: allJobs.filter(j => ['queued', 'rendering', 'assembling'].includes(j.status)).length,
      completedJobs: allJobs.filter(j => j.status === 'done').length,
      failedJobs: allJobs.filter(j => j.status === 'failed').length,
    };
  }
}

module.exports = JobStore;
