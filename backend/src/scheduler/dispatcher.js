/**
 * scheduler/dispatcher.js
 * Advanced distributed render scheduler with power-based frame splitting,
 * automatic recovery on node disconnection/failure, and server-side consolidations/assembly.
 */
const JobStore = require('./jobStore');
const CostEstimator = require('./costEstimator');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const config = require('../config');
const pinata = require('../ipfs/pinata');
const EncryptionManager = require('../encryption/manager');

class Dispatcher {
  constructor(io) {
    this.io = io; // Socket.io server instance for real-time push
    this._dispatchLoop = null;
  }

  /**
   * Helper to download a CID from IPFS with gateway fallback and retry mechanisms.
   */
  async _downloadFromIpfs(cid, timeoutMs = 90000) {
    const gateways = [
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`
    ];

    let lastError = null;
    for (const url of gateways) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.info(`[Dispatcher] IPFS Download attempt ${attempt} for CID ${cid} via: ${url}`);
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            timeout: timeoutMs,
            headers: {
              'Accept': '*/*'
            }
          });
          if (response.status === 200 && response.data) {
            logger.info(`[Dispatcher] IPFS Download successful for CID ${cid} via gateway: ${url}`);
            return response.data;
          }
        } catch (err) {
          lastError = err;
          logger.warn(`[Dispatcher] IPFS Download attempt ${attempt} failed for CID ${cid} via ${url}: ${err.message}`);
          // Wait slightly before retrying the same gateway
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw new Error(`IPFS download failed for CID ${cid} after trying multiple gateways and retries. Last error: ${lastError ? lastError.message : 'Unknown'}`);
  }

  /**
   * Start the dispatch polling loop (every 5 seconds)
   */
  start() {
    logger.info('[Dispatcher] Job dispatch engine started (5s polling interval).');
    this._dispatchLoop = setInterval(() => this._tick(), 5000);
  }

  stop() {
    if (this._dispatchLoop) clearInterval(this._dispatchLoop);
    logger.info('[Dispatcher] Job dispatch engine stopped.');
  }

  /**
   * Helper to check if a worker is actively connected via Socket.io
   */
  _isWorkerSocketConnected(workerAddress) {
    if (!this.io || !this.io.sockets || !this.io.sockets.adapter) return false;
    const room = this.io.sockets.adapter.rooms.get(`worker:${workerAddress}`);
    return !!(room && room.size > 0);
  }

  /**
   * Main dispatch tick: assign pending jobs to idle workers
   */
  _tick() {
    // 1. Auto-recovery: If a job is 'queued' but its worker disconnected or went back to 'idle',
    // it means they missed the real-time push. Re-queue the job back to 'pending'.
    const allJobs = JobStore.getAllJobs();
    const queuedJobs = allJobs.filter(j => j.status === 'queued');
    for (const job of queuedJobs) {
      if (job.assignedWorker) {
        const worker = JobStore.getWorker(job.assignedWorker);
        const isConnected = this._isWorkerSocketConnected(job.assignedWorker);
        
        if (!worker || worker.status === 'idle' || worker.status === 'offline' || !isConnected) {
          logger.warn(`[Dispatcher] Job ${job.id} was queued but worker ${job.assignedWorker} is ${worker ? worker.status : 'unknown'} or socket disconnected. Re-queuing back to pending.`);
          JobStore.updateJob(job.id, { status: 'pending', assignedWorker: null });
          this.io.emit('job:status', {
            jobId: job.id,
            status: 'pending',
            assignedWorker: null,
          });
        }
      }
    }

    // 2. Standard & Swarm Dispatching
    const pendingJobs = JobStore.getPendingJobs();
    // Only dispatch to idle workers who are actively connected via Socket.io
    const idleWorkers = JobStore.getIdleWorkers().filter(w => this._isWorkerSocketConnected(w.address));

    if (pendingJobs.length === 0 || idleWorkers.length === 0) return;

    for (const job of pendingJobs) {
      // Refresh list of connected idle workers for each job allocation
      const currentIdleWorkers = JobStore.getIdleWorkers().filter(w => this._isWorkerSocketConnected(w.address));
      if (currentIdleWorkers.length === 0) break;

      const totalFrames = job.endFrame - job.startFrame + 1;

      // SWARM INITIATOR: If 2+ nodes are idle, and job contains 2+ frames, split them proportionally!
      if (currentIdleWorkers.length >= 2 && totalFrames >= 2) {
        logger.info(`[Dispatcher] Swarm detected! Splitting Job ${job.id} (${totalFrames} frames) across ${currentIdleWorkers.length} nodes.`);
        
        // Sum the benchmark scores of all connected idle nodes
        const totalBenchmark = currentIdleWorkers.reduce((sum, w) => sum + (w.benchmarkScore || 10), 0);
        
        let currentFrame = job.startFrame;
        const parentSegments = [];
        const sortedWorkers = currentIdleWorkers.sort((a, b) => (b.benchmarkScore || 0) - (a.benchmarkScore || 0));

        for (let i = 0; i < sortedWorkers.length; i++) {
          if (currentFrame > job.endFrame) break;

          const worker = sortedWorkers[i];
          const ratio = totalBenchmark > 0 ? ((worker.benchmarkScore || 10) / totalBenchmark) : (1 / sortedWorkers.length);
          
          let frameShare = Math.round(ratio * totalFrames);
          if (frameShare <= 0 && currentFrame <= job.endFrame) {
            frameShare = 1;
          }

          const start = currentFrame;
          const end = Math.min(job.endFrame, start + frameShare - 1);

          if (start <= job.endFrame) {
            const segmentFrameCount = end - start + 1;

            // Create a virtual child job for this specific segment
            const childJob = JobStore.createJob({
              creatorWallet: job.creatorWallet,
              assetCid: job.assetCid,
              encryptionKey: job.encryptionKey,
              startFrame: start,
              endFrame: end,
              resolution: job.resolution,
              samples: job.samples,
              rewardEth: parseFloat((job.rewardEth * (segmentFrameCount / totalFrames)).toFixed(6)),
              speedPriority: job.speedPriority,
              exportFormat: job.exportFormat,
              status: 'pending'
            });

            // Mark reference to parent job
            JobStore.updateJob(childJob.id, { parentJobId: job.id });

            parentSegments.push({
              childJobId: childJob.id,
              workerAddress: worker.address,
              startFrame: start,
              endFrame: end,
              status: 'pending',
              resultCid: null
            });

            logger.info(`[Dispatcher] Segment job ${childJob.id} created for worker ${worker.address} (Frames ${start}-${end})`);
            
            // Assign this segment job to the worker immediately
            this._assignJobToWorker(childJob, worker);
            currentFrame = end + 1;
          }
        }

        // Leftover frame safety check (rounding errors)
        if (currentFrame <= job.endFrame && parentSegments.length > 0) {
          const lastSeg = parentSegments[parentSegments.length - 1];
          const childJob = JobStore.getJob(lastSeg.childJobId);
          if (childJob) {
            const newEnd = job.endFrame;
            const newShare = newEnd - childJob.startFrame + 1;

            JobStore.updateJob(childJob.id, {
              endFrame: newEnd,
              totalFrames: newShare,
              rewardEth: parseFloat((job.rewardEth * (newShare / totalFrames)).toFixed(6))
            });

            lastSeg.endFrame = newEnd;

            const worker = JobStore.getWorker(lastSeg.workerAddress);
            if (worker) {
              logger.info(`[Dispatcher] Adjusted leftover frames for Worker ${worker.address} (Extended segment to ${childJob.startFrame}-${newEnd})`);
              this.io.to(`worker:${worker.address}`).emit('job:assigned', {
                jobId: childJob.id,
                assetCid: childJob.assetCid,
                encryptionKey: childJob.encryptionKey,
                startFrame: childJob.startFrame,
                endFrame: childJob.endFrame,
                rewardEth: childJob.rewardEth,
              });
            }
          }
        }

        // Set parent job to rendering and save segments list
        JobStore.updateJob(job.id, {
          status: 'rendering',
          segments: parentSegments,
          assignedWorker: 'Swarm Network'
        });

        // Broadcast parent rendering status to frontend
        this.io.emit('job:status', {
          jobId: job.id,
          status: 'rendering',
          assignedWorker: 'Swarm Network'
        });

      } else {
        // Fallback: standard 1-to-1 single node allocation
        const sortedWorkers = currentIdleWorkers.sort((a, b) => b.benchmarkScore - a.benchmarkScore);
        const worker = sortedWorkers.shift();
        this._assignJobToWorker(job, worker);
      }
    }
  }

  /**
   * Assign a specific job to a specific worker and notify via socket
   */
  _assignJobToWorker(job, worker) {
    JobStore.markQueued(job.id);
    JobStore.updateWorkerHeartbeat(worker.address, { status: 'rendering', currentJobId: job.id });

    logger.info(`[Dispatcher] Assigned job ${job.id} → worker ${worker.address} (Score: ${worker.benchmarkScore})`);

    // Push job assignment via Socket.io to the specific worker room
    this.io.to(`worker:${worker.address}`).emit('job:assigned', {
      jobId: job.id,
      assetCid: job.assetCid,
      encryptionKey: job.encryptionKey,
      startFrame: job.startFrame,
      endFrame: job.endFrame,
      rewardEth: job.rewardEth,
    });

    // Broadcast status update to all frontend clients
    this.io.emit('job:status', {
      jobId: job.id,
      status: 'queued',
      assignedWorker: worker.address,
      workerGpu: worker.gpuName,
    });
  }

  /**
   * Handle a job completion event from a worker
   */
  async handleJobCompletion(jobId, workerAddress, resultCid) {
    const job = JobStore.getJob(jobId);
    if (!job) return;

    logger.info(`[Dispatcher] Worker ${workerAddress} completed job/segment ${jobId} with CID: ${resultCid}`);

    // If this completed job is a virtual segment
    if (job.parentJobId) {
      const parentJob = JobStore.getJob(job.parentJobId);
      if (parentJob) {
        // Mark the virtual child job as done
        JobStore.markDone(jobId, resultCid);

        // Update the segment's completion state on the parent job
        const segments = parentJob.segments || [];
        const segIdx = segments.findIndex(s => s.childJobId === jobId);
        if (segIdx !== -1) {
          segments[segIdx].status = 'done';
          segments[segIdx].resultCid = resultCid;
        }

        // Update worker's active parameters
        const worker = JobStore.getWorker(workerAddress);
        if (worker) {
          worker.completedJobs += 1;
          worker.totalEarnings += (job.rewardEth || 0);
          worker.status = 'idle';
          worker.currentJobId = null;
          JobStore.updateWorkerHeartbeat(workerAddress, worker);
        }

        // Calculate progress across all child jobs
        const completedSegments = segments.filter(s => s.status === 'done').length;
        const parentProgress = Math.floor((completedSegments / segments.length) * 100);

        logger.info(`[Dispatcher] Parent Job ${parentJob.id}: segment ${completedSegments}/${segments.length} done.`);

        // If not all segments are done yet, update overall progress of parent
        const allDone = segments.every(s => s.status === 'done');
        if (!allDone) {
          JobStore.updateJob(parentJob.id, { progress: Math.min(95, parentProgress), segments });
          this.io.emit('job:progress', {
            jobId: parentJob.id,
            progress: Math.min(95, parentProgress),
            segments
          });
          
          // Trigger dispatcher to pick up any other queued tasks
          this._tick();
          return;
        }

        // If all segments are done, initiate consolidation/assembly!
        logger.info(`[Dispatcher] All segments done for Parent Job ${parentJob.id}. Launching consolidation assembly...`);
        JobStore.updateJob(parentJob.id, { status: 'assembling', progress: 95, segments });
        this.io.emit('job:status', {
          jobId: parentJob.id,
          status: 'assembling',
          progress: 95
        });

        // Run consolidated assembly in background asynchronously to prevent event blocking
        setTimeout(() => {
          this.assembleDistributedFrames(parentJob);
        }, 100);

        // Trigger dispatcher tick
        this._tick();
        return;
      }
    }

    // ─────────────────────────── Standard Single Worker complete path ───────────────────────────
    JobStore.markDone(jobId, resultCid);
    const worker = JobStore.getWorker(workerAddress);
    if (worker) {
      worker.completedJobs += 1;
      worker.totalEarnings += (job.rewardEth || 0);
      worker.status = 'idle';
      worker.currentJobId = null;
      JobStore.updateWorkerHeartbeat(workerAddress, worker);
    }

    logger.info(`[Dispatcher] Standard Job ${jobId} completed by ${workerAddress}. Result CID: ${resultCid}`);

    // Trigger on-chain escrow release
    const BlockchainManager = require('../blockchain/blockchain');
    const txHash = await BlockchainManager.logRelease(jobId, workerAddress, job.rewardEth || 0, resultCid);

    this.io.emit('job:completed', {
      jobId,
      resultCid,
      workerAddress,
      rewardEth: job.rewardEth,
      txHash,
    });

    // Run tick to allocate next job
    this._tick();
  }

  /**
   * Handle a job failure report from a worker
   */
  async handleJobFailure(jobId, workerAddress, error) {
    const job = JobStore.getJob(jobId);
    if (!job) return;

    logger.error(`[Dispatcher] Job/Segment ${jobId} FAILED by worker ${workerAddress}: ${error}`);

    // If this failed job is a virtual segment
    if (job.parentJobId) {
      const parentJob = JobStore.getJob(job.parentJobId);
      if (parentJob) {
        // Reset the child job's status to 'pending' and remove assignment so it gets dispatched again!
        JobStore.updateJob(jobId, { status: 'pending', assignedWorker: null });
        
        // Update parent segment references to 'pending'
        const segments = parentJob.segments || [];
        const segIdx = segments.findIndex(s => s.childJobId === jobId);
        if (segIdx !== -1) {
          segments[segIdx].status = 'pending';
          segments[segIdx].resultCid = null;
        }
        JobStore.updateJob(parentJob.id, { segments });

        // Restore worker back to idle
        const worker = JobStore.getWorker(workerAddress);
        if (worker) {
          worker.status = 'idle';
          worker.currentJobId = null;
          JobStore.updateWorkerHeartbeat(workerAddress, worker);
        }

        logger.warn(`[Dispatcher] Parent Job ${parentJob.id}: Segment ${jobId} failed. Re-queued back to pending for automatic recovery.`);
        this.io.emit('job:progress', {
          jobId: parentJob.id,
          progress: parentJob.progress,
          segments,
          warning: `Segment ${jobId} failed and was re-queued.`
        });

        // Trigger tick immediately to assign the failed segment to another idle node!
        this._tick();
        return;
      }
    }

    // ─────────────────────────── Standard Single Worker failure path ───────────────────────────
    JobStore.markFailed(jobId, error);
    const worker = JobStore.getWorker(workerAddress);
    if (worker) {
      worker.status = 'idle';
      worker.currentJobId = null;
      JobStore.updateWorkerHeartbeat(workerAddress, worker);
    }

    // Trigger on-chain escrow refund back to creator
    let txHash = null;
    const BlockchainManager = require('../blockchain/blockchain');
    txHash = await BlockchainManager.logRefund(jobId, job.creatorWallet || 'anonymous', job.rewardEth || 0, error);

    this.io.emit('job:failed', { jobId, error, txHash });
    
    // Run tick to allocate next job
    this._tick();
  }

  /**
   * Downloads segment zips from IPFS, decrypts, unzips, merges, zip-and-encrypts, and uploads to IPFS.
   */
  async assembleDistributedFrames(parentJob) {
    const tempDir = path.join(config.UPLOAD_DIR, `assemble_${parentJob.id}`);
    logger.info(`[Dispatcher] Beginning frame assembly for Parent Job ${parentJob.id} in temp dir ${tempDir}`);
    
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const segments = parentJob.segments || [];
      const decryptedFramesFolder = path.join(tempDir, 'frames');
      if (!fs.existsSync(decryptedFramesFolder)) {
        fs.mkdirSync(decryptedFramesFolder, { recursive: true });
      }

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const childJob = JobStore.getJob(seg.childJobId);
        const cid = seg.resultCid || (childJob ? childJob.resultCid : null);

        if (!cid) {
          throw new Error(`Missing result CID for segment ${seg.childJobId}`);
        }

        const segmentZipEncPath = path.join(tempDir, `segment_${i}.zip.enc`);
        const segmentZipDecPath = path.join(tempDir, `segment_${i}.zip`);

        // Check if cached local copy exists in RENDERS_DIR
        const cachedPath = path.join(config.RENDERS_DIR, `results_${cid}.zip.enc`);
        if (fs.existsSync(cachedPath)) {
          logger.info(`[Dispatcher] Segment ${i} found in local cache: ${cachedPath}`);
          fs.copyFileSync(cachedPath, segmentZipEncPath);
        } else {
          // Download from IPFS Gateway with robust fallback
          logger.info(`[Dispatcher] Downloading segment ${i} (CID ${cid}) from IPFS...`);
          const buffer = await this._downloadFromIpfs(cid, 90000);
          fs.writeFileSync(segmentZipEncPath, buffer);
        }

        // Decrypt segment
        logger.info(`[Dispatcher] Decrypting segment ${i} zip...`);
        const ok = EncryptionManager.decryptFile(segmentZipEncPath, segmentZipDecPath, parentJob.encryptionKey);
        if (!ok) {
          throw new Error(`Failed to decrypt segment ${i}`);
        }

        // Extract PNGs using adm-zip
        logger.info(`[Dispatcher] Extracting segment ${i} PNG frames...`);
        const zip = new AdmZip(segmentZipDecPath);
        zip.extractAllTo(decryptedFramesFolder, true);
      }

      // Collect all extracted png files
      const files = fs.readdirSync(decryptedFramesFolder).filter(f => f.toLowerCase().endsWith('.png'));
      if (files.length === 0) {
        throw new Error('No frame images found in decrypted segments!');
      }

      logger.info(`[Dispatcher] Successfully unzipped ${files.length} frames total. Packing master zip...`);

      // Zip all frames back together
      const masterZip = new AdmZip();
      for (const f of files) {
        masterZip.addLocalFile(path.join(decryptedFramesFolder, f));
      }
      
      const masterDecryptedZipPath = path.join(tempDir, 'master_decrypted.zip');
      masterZip.writeZip(masterDecryptedZipPath);

      // Encrypt master zip
      const masterEncryptedZipPath = path.join(config.RENDERS_DIR, `results_${parentJob.id}.zip.enc`);
      logger.info(`[Dispatcher] Encrypting master results file to ${masterEncryptedZipPath}...`);
      const encOk = EncryptionManager.encryptFile(masterDecryptedZipPath, masterEncryptedZipPath, parentJob.encryptionKey);
      if (!encOk) {
        throw new Error('Failed to encrypt consolidated master results ZIP.');
      }

      // Upload consolidated master zip to IPFS
      logger.info(`[Dispatcher] Uploading final master ZIP to Pinata...`);
      const masterCid = await pinata.uploadFile(masterEncryptedZipPath, `results_consolidated_${parentJob.id}.zip.enc`);
      if (!masterCid) {
        throw new Error('Failed to upload consolidated master results ZIP to IPFS.');
      }

      logger.info(`[Dispatcher] Multi-node frame assembly complete. Final Consolidated CID: ${masterCid}`);

      // Finalize Parent Job status
      JobStore.markDone(parentJob.id, masterCid);

      // Release escrow rewards to each child job's worker on-chain (using the child job details)
      const BlockchainManager = require('../blockchain/blockchain');
      for (const seg of segments) {
        const childJob = JobStore.getJob(seg.childJobId);
        if (childJob && childJob.assignedWorker) {
          logger.info(`[Dispatcher] Dispatching on-chain reward payout of ${childJob.rewardEth} ETH for segment ${seg.childJobId} to worker ${childJob.assignedWorker}`);
          await BlockchainManager.logRelease(seg.childJobId, childJob.assignedWorker, childJob.rewardEth || 0, seg.resultCid || childJob.resultCid);
        }
      }

      // Broadcast final job status
      this.io.emit('job:completed', {
        jobId: parentJob.id,
        resultCid: masterCid,
        workerAddress: 'Distributed Swarm Network',
        rewardEth: parentJob.rewardEth,
        isDistributed: true
      });

    } catch (err) {
      logger.error(`[Dispatcher] Frame assembly error for Job ${parentJob.id}: ${err.message}`);
      JobStore.markFailed(parentJob.id, `Consolidated assembly error: ${err.message}`);
      
      // Trigger refunds for parent
      const BlockchainManager = require('../blockchain/blockchain');
      await BlockchainManager.logRefund(parentJob.id, parentJob.creatorWallet || 'anonymous', parentJob.rewardEth || 0, err.message);

      this.io.emit('job:failed', { jobId: parentJob.id, error: err.message });
    } finally {
      // Clean up local temp directory to free disk space
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanErr) {
        logger.error(`[Dispatcher] Clean up error in tempDir ${tempDir}: ${cleanErr.message}`);
      }
    }
  }
}

module.exports = Dispatcher;
