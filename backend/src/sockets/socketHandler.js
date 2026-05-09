/**
 * sockets/socketHandler.js
 * Real-time Socket.io event bus for workers and frontend clients
 */
const JobStore = require('../scheduler/jobStore');
const logger = require('../logger');

function initSocketHandler(io, dispatcher) {
  io.on('connection', (socket) => {
    // python-socketio sends auth dict or headers; browser clients use query params
    const role    = socket.handshake.query.role    || (socket.handshake.auth && socket.handshake.auth.role)    || socket.handshake.headers['role'] || 'client';
    const address = socket.handshake.query.address || (socket.handshake.auth && socket.handshake.auth.address) || socket.handshake.headers['address'] || null;
    logger.info(`[Socket] Connected: ${socket.id} | role=${role} | address=${address}`);

    // ── Worker joins its private room so dispatcher can target it ──
    if (role === 'worker' && address) {
      socket.join(`worker:${address}`);
      logger.info(`[Socket] Worker ${address} joined room worker:${address}`);

      // Worker sends periodic heartbeat
      socket.on('worker:heartbeat', (stats) => {
        const worker = JobStore.updateWorkerHeartbeat(address, {
          gpuName: stats.gpu,
          vram: stats.vram,
          usage: stats.usage,
          temperature: stats.temperature,
          benchmarkScore: stats.benchmarkScore,
          status: stats.status || 'idle',
          lastSeen: new Date().toISOString(),
        });
        if (worker) {
          // Broadcast updated worker list to frontend
          io.emit('network:stats', JobStore.getNetworkStats());
          io.emit('workers:list', JobStore.getAllWorkers());

          // If worker is idle, run the dispatcher instantly to assign any pending jobs!
          if (worker.status === 'idle') {
            dispatcher._tick();
          }
        }
      });

      // Worker reports job completion
      socket.on('worker:job_complete', ({ jobId, resultCid }) => {
        dispatcher.handleJobCompletion(jobId, address, resultCid);
      });

      // Worker reports job failure
      socket.on('worker:job_failed', ({ jobId, error }) => {
        dispatcher.handleJobFailure(jobId, address, error);
      });

      // Worker reports frame-level progress
      socket.on('worker:frame_progress', ({ jobId, samplesCompleted, totalSamples, frameIdx }) => {
        const pct = Math.floor((samplesCompleted / totalSamples) * 80);
        JobStore.updateProgress(jobId, pct);
        io.emit('job:progress', { jobId, progress: pct, frameIdx });
      });

      // Worker registers itself on connect
      socket.on('worker:register', (info) => {
        JobStore.registerWorker({
          address: info.address || address,
          gpuName: info.gpuName || info.gpu || 'Unknown',
          vram: info.vram || 0,
          benchmarkScore: info.benchmarkScore || 0,
          status: 'idle',
        });
        io.emit('network:stats', JobStore.getNetworkStats());
        io.emit('workers:list', JobStore.getAllWorkers());
        socket.emit('worker:registered', { success: true, address: info.address || address });

        // Trigger dispatcher immediately to assign any pending jobs
        // (with a small timeout to allow room join propagation on adapter)
        setTimeout(() => {
          dispatcher._tick();
        }, 100);
      });
    }

    // ── Frontend client events ──
    if (role === 'client') {
      // Client requests current network stats on connect
      socket.emit('network:stats', JobStore.getNetworkStats());
      socket.emit('workers:list', JobStore.getAllWorkers());
      socket.emit('jobs:list', JobStore.getAllJobs().slice(0, 20));
    }

    socket.on('disconnect', () => {
      logger.info(`[Socket] Disconnected: ${socket.id} | role=${role}`);
      if (role === 'worker' && address) {
        const worker = JobStore.getWorker(address);
        if (worker) {
          JobStore.updateWorkerHeartbeat(address, { status: 'offline' });
          io.emit('network:stats', JobStore.getNetworkStats());
          io.emit('workers:list', JobStore.getAllWorkers());
        }
      }
    });
  });
}

module.exports = initSocketHandler;
