/**
 * src/server.js
 * RendoFren Backend Orchestration Server
 * Express + Socket.io + Job Dispatcher
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const logger = require('./logger');
const Dispatcher = require('./scheduler/dispatcher');
const initSocketHandler = require('./sockets/socketHandler');
const JobStore = require('./scheduler/jobStore');

// API Routes
const uploadRouter = require('./api/upload');
const jobsRouter = require('./api/jobs');
const workersRouter = require('./api/workers');
const blockchainRouter = require('./api/blockchain');
const authRouter = require('./api/auth');

// ── App Setup ─────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static file serving for exported renders
fs.mkdirSync(config.EXPORTS_DIR, { recursive: true });
fs.mkdirSync(config.RENDERS_DIR, { recursive: true });
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true });

app.use('/exports', express.static(config.EXPORTS_DIR, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
  }
}));
app.use('/renders', express.static(config.RENDERS_DIR, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
  }
}));

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/upload', uploadRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/workers', workersRouter);
app.use('/api/blockchain', blockchainRouter);
app.use('/api/auth', authRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RendoFren Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    network: JobStore.getNetworkStats(),
  });
});

// Network stats snapshot
app.get('/api/network/stats', (req, res) => {
  res.json(JobStore.getNetworkStats());
});

// Cost estimation (no-auth shortcut)
app.post('/api/estimate', (req, res) => {
  const CostEstimator = require('./scheduler/costEstimator');
  const { frameCount = 1, resolution = '1920x1080', samples = 128, benchmarkScore = 300 } = req.body;
  const estimate = CostEstimator.estimate({
    frameCount: parseInt(frameCount),
    resolution,
    samples: parseInt(samples),
    benchmarkScore: parseInt(benchmarkScore),
  });
  res.json(estimate);
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`[Server] Unhandled error: ${err.message}`);
  res.status(500).json({ error: err.message });
});

// ── Socket.io ─────────────────────────────────────────────────────────
const dispatcher = new Dispatcher(io);
app.set('dispatcher', dispatcher);
app.set('io', io);
initSocketHandler(io, dispatcher);

// ── Start ─────────────────────────────────────────────────────────────
server.listen(config.PORT, () => {
  logger.info(`╔════════════════════════════════════════════╗`);
  logger.info(`║  RendoFren Backend Server                  ║`);
  logger.info(`║  Listening on http://localhost:${config.PORT}        ║`);
  logger.info(`╚════════════════════════════════════════════╝`);
  dispatcher.start();
});

// ── Graceful shutdown ─────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM received. Shutting down gracefully...');
  dispatcher.stop();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('[Server] SIGINT received. Shutting down...');
  dispatcher.stop();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };
