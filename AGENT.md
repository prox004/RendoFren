# RendoFren — Antigravity Build Plan & Prompts

## Project Overview

RendoFren is a decentralized GPU rendering network for Blender and After Effects workflows.

The system allows creators to:

- Upload Blender project files
- Encrypt rendering jobs
- Distribute rendering tasks across GPU worker nodes
- Render frames in parallel
- Export final video/image outputs
- Use blockchain-backed escrow/reward logic
- Track node earnings and render statistics

The architecture is intentionally simplified for hackathon execution.

We are NOT building:

- fully decentralized networking
- real peer-to-peer node discovery
- advanced DRM systems
- complex tokenomics
- fully trustless verification

We ARE building:

- secure distributed rendering workflow
- encrypted rendering pipeline
- worker orchestration
- GPU benchmarking
- render marketplace infrastructure
- polished UI/UX

---

# Final Architecture

```text
Frontend
│
├── Upload UI
├── Job Dashboard
├── Render Progress
├── Wallet Login
├── Node Dashboard
├── Cost Estimation View
└── Export Manager

Backend
│
├── API Server
├── Encryption Manager
├── Job Scheduler
├── Frame Splitter
├── Worker Coordinator
├── Export Engine
├── Cost Estimator
├── Reward Engine
└── IPFS Storage Layer

Worker
│
├── GPU Benchmark Tool
├── Blender Renderer
├── Secure Decrypt/Render/Encrypt
├── GPU Monitor
├── Earnings Stats
└── Result Uploader

Blockchain
│
├── Escrow Contract
├── Reward Distribution
├── Wallet Identity
└── Job Metadata Logs
```

---

# Tech Stack

## Frontend

- React
- Vite
- TailwindCSS
- Zustand
- Socket.io client
- Ethers.js

## Backend

- Node.js
- Express
- BullMQ
- Redis
- Socket.io
- AES-256 encryption
- FFmpeg
- Pinata IPFS

## Worker

- Python
- Blender CLI
- GPUtil
- psutil
- PyCryptodome

## Blockchain

- Solidity
- Hardhat
- Base Sepolia

---

# IMPORTANT DEVELOPMENT RULES

1. Build LOCAL-FIRST.
2. Workers can initially run on the same machine.
3. Ignore real P2P networking initially.
4. Ignore advanced blockchain logic.
5. Focus on working rendering pipeline.
6. Use Docker later, not first.
7. Use IPFS only for encrypted assets.
8. Never upload raw blend files.
9. UI polish matters heavily for demo.
10. Demo stability is more important than architecture perfection.

---

# GalaxyRend Code Reuse Strategy

We are allowed to study and reuse implementation concepts from GalaxyRend.

We should specifically reuse/adapt:

- Blender CLI execution logic
- Worker render pipeline
- Job metadata structure
- IPFS upload concepts
- Worker lifecycle handling
- Render orchestration ideas

We should NOT reuse:

- Starknet contracts
- Cairo tooling
- Scarb setup
- Starknet deployment logic

We are rebuilding the architecture cleanly using:

- Solidity
- Base Sepolia
- Standard Node.js backend

---

# DEVELOPMENT ORDER

## Phase 1

Worker Rendering Engine

## Phase 2

Backend Job Scheduler

## Phase 3

IPFS + Encryption

## Phase 4

Frontend Dashboard

## Phase 5

Blockchain Escrow

---

# PROMPT 1 — WORKER SYSTEM

Build the Worker service for RendoFren.

Requirements:

The worker is a GPU rendering node responsible for:

- receiving rendering jobs
- downloading encrypted Blender files
- decrypting files temporarily
- rendering assigned frames using Blender CLI
- encrypting rendered output frames
- uploading results back to backend/IPFS
- tracking GPU statistics and earnings

Tech stack:

- Python
- Blender CLI
- GPUtil
- psutil
- PyCryptodome

Features:

1. GPU Benchmark System

- detect GPU name
- VRAM
- CUDA/OpenCL support
- benchmark render speed
- generate benchmark score

2. Worker Heartbeat Send status to backend every 10 seconds.

Example:

```json
{
  "gpu": "RTX 3060",
  "vram": 12,
  "usage": 40,
  "temperature": 65,
  "status": "idle"
}
```

3. Blender Rendering Engine Use Blender CLI.

Example:

```bash
blender -b project.blend -s 1 -e 50 -a
```

Support:

- frame ranges
- output directory
- GPU rendering
- Cycles rendering

4. Secure Render Pipeline Workflow:

- receive encrypted blend file
- decrypt temporarily
- render assigned frames
- encrypt output frames
- delete decrypted temp data

5. Result Upload Upload encrypted frames back to backend.

6. Worker Dashboard API Expose:

- current job
- total earnings
- completed jobs
- GPU stats
- benchmark score

7. Logging Detailed render logs and error logs.

8. Architecture Requirements

- modular Python structure
- render manager
- encryption manager
- GPU monitor
- heartbeat service
- upload service

9. IMPORTANT Study GalaxyRend worker concepts and Blender execution flow. Reuse/adapt rendering pipeline concepts where useful. Do NOT use Starknet/Cairo code.

Goal: Create a production-like local worker MVP for hackathon demonstration.

---

# PROMPT 2 — BACKEND SYSTEM

Build the backend orchestration server for RendoFren.

Tech stack:

- Node.js
- Express
- BullMQ
- Redis
- Socket.io
- FFmpeg
- AES encryption
- Pinata IPFS

Responsibilities:

- job orchestration
- encryption management
- worker coordination
- render scheduling
- export generation
- cost estimation
- blockchain reward integration

Features:

1. Upload API

- accept Blender project uploads
- validate file size/type
- create job metadata

2. Encryption Layer

- AES-256 encryption
- per-job encryption key
- never store raw blend publicly

3. IPFS Integration

- upload encrypted files to Pinata
- store CIDs
- provide secure retrieval

4. Job Scheduler

- split frame ranges
- assign workers based on benchmark score
- support retries
- queue pending jobs

5. Worker Coordination

- maintain active node list
- heartbeat monitoring
- GPU availability tracking

6. Cost Estimation Engine Estimate:

- render time
- estimated cost
- recommended GPU tier

Inputs:

- frame count
- resolution
- samples
- benchmark score

7. Export Engine Use FFmpeg.

Support:

- MP4 export
- image sequence export
- ZIP export
- GIF export

8. Render Assembly Pipeline

- collect rendered frames
- decrypt outputs
- assemble final output
- generate downloadable export

9. Socket.io Real-Time Updates Provide:

- render progress
- worker activity
- job status
- completion events

10. Reward Engine Prepare reward calculations for blockchain escrow.

11. Architecture Create clean modular backend:

```text
src/
  api/
  scheduler/
  workers/
  encryption/
  ipfs/
  exports/
  blockchain/
  sockets/
```

12. IMPORTANT Study GalaxyRend job pipeline and render orchestration concepts. Reuse useful architectural ideas. Do NOT include Starknet/Cairo.

Goal: Create a scalable orchestration backend suitable for hackathon deployment.

---

# PROMPT 3 — FRONTEND SYSTEM

Build the frontend UI for RendoFren.

Tech stack:

- React
- Vite
- TailwindCSS
- Framer Motion
- Socket.io client
- Zustand
- Ethers.js

Theme: Modern cyberpunk/Web3 creator dashboard.

Features:

1. Landing Page

- explain decentralized rendering
- show GPU network concept
- animated dashboard preview

2. Upload Dashboard Allow users to:

- upload Blender files
- configure render settings
- choose export format
- select render quality
- estimate cost/time

3. Job Dashboard Display:

- progress bar
- active workers
- rendered frames
- render statistics
- estimated completion

4. Node Dashboard For workers:

- GPU stats
- earnings
- benchmark score
- active jobs
- render speed
- network statistics

5. Wallet Integration

- MetaMask login
- Base Sepolia support
- wallet-based identity

6. Export Manager Allow:

- MP4 download
- image sequence download
- ZIP download
- render previews

7. Real-Time Updates Use Socket.io for:

- progress updates
- node activity
- render completion

8. Design Style

- futuristic dark theme
- GPU/network visualization
- animated progress indicators
- terminal-inspired panels
- polished hackathon demo UI

9. Architecture

```text
src/
  pages/
  components/
  hooks/
  store/
  services/
  sockets/
```

10. IMPORTANT Frontend should feel like:

- Render Network
- modern AI infrastructure dashboard
- GPU cloud platform

11. IMPORTANT Focus heavily on:

- smooth UX
- demo polish
- clean animations
- professional visuals

Goal: Create a visually impressive hackathon-ready frontend for decentralized rendering.

---

# BLOCKCHAIN MVP PROMPT

Build a minimal blockchain escrow system for RendoFren.

Tech stack:

- Solidity
- Hardhat
- Base Sepolia
- Ethers.js

Requirements:

1. Job Escrow Contract

- user deposits render funds
- escrow locks funds
- backend can mark completion
- release rewards to worker wallet

2. Wallet Identity

- wallet login
- node identity via wallet address

3. Job Logs Store:

- job id
- creator wallet
- worker wallet
- reward amount
- completion status

4. Keep Contract SIMPLE Do NOT implement:

- decentralized verification
- complex staking
- DAO governance
- tokenomics

5. Goal Provide believable blockchain integration for hackathon demo.

---

# FINAL MVP GOAL

By demo day, the system should support:

```text
Upload blend file
→ Encrypt
→ Upload to IPFS
→ Split frames
→ Assign workers
→ Parallel render
→ Encrypt outputs
→ Assemble MP4
→ Release rewards
→ Download output
```

This is the minimum successful hackathon MVP.

