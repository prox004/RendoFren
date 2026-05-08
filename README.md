# RendoFren — Decentralized GPU Rendering Network

RendoFren is a decentralized GPU rendering network specifically designed for Blender and After Effects workflows. It connects creators who need rendering power with GPU worker nodes, providing a secure, efficient, and blockchain-backed pipeline for distributed rendering.

## 🚀 Key Features

- **Secure Project Upload**: Blender project files are encrypted before being distributed to the network.
- **Distributed Rendering**: Rendering jobs are split into individual frames and processed in parallel across multiple GPU worker nodes.
- **Worker Orchestration**: Intelligent scheduling and coordination of render tasks via a centralized backend with a distributed worker pool.
- **GPU Benchmarking**: Integrated tools to assess worker performance and calculate earnings/costs based on GPU capabilities.
- **Blockchain Escrow**: Secure payment and reward distribution using smart contracts to ensure fairness for both creators and workers.
- **Export Management**: Automated assembly of rendered frames into final video or image sequence outputs.

## 🏗️ Architecture

### [Frontend](frontend/) (React + Vite)
- Job creation and upload dashboard.
- Real-time render progress tracking.
- Wallet integration for payments and node management.
- Worker performance stats and earnings dashboard.

### [Backend](backend/) (Node.js + Express)
- **API Server**: Manages job lifecycles and user accounts.
- **Encryption Manager**: Handles AES-256 encryption for secure file handling.
- **Job Scheduler & Frame Splitter**: Uses BullMQ (Redis) to manage and distribute frame-level tasks.
- **Worker Coordinator**: Manages Socket.io connections with active worker nodes.
- **IPFS Storage Layer**: Uses Pinata for decentralized storage of encrypted assets.

### [Worker](worker/) (Python + PyQt6)
- **GPU Benchmark Tool**: Evaluates rendering speed.
- **Blender Renderer**: Local Blender instance for frame processing.
- **Secure Pipeline**: Local decryption of project files, rendering, and re-encryption of results.
- **GUI Dashboard**: User-friendly interface for node operators to track earnings and status.

### [Blockchain](contracts/) (Solidity)
- **Escrow Contract**: Holds funds until job completion.
- **Reward Engine**: Transparent distribution of earnings to worker nodes.
- **Metadata Logging**: Immutable history of job completion and performance.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Zustand, Socket.io, Ethers.js.
- **Backend**: Node.js, Express, BullMQ, Redis (Upstash), Socket.io, AES-256.
- **Worker**: Python, PyQt6, Blender (CLI), PyCryptodome.
- **Blockchain**: Solidity, Hardhat, Base/Ethereum L2.

## 🏁 Getting Started

### Prerequisites

- **Node.js**: v18 or higher.
- **Python**: 3.10 or higher.
- **Blender**: Installed and accessible in your system PATH.
- **Redis**: An active Redis instance (e.g., Upstash).

### 1. Environment Configuration

Create a `.env` file in the `backend/` directory (and root if needed) with the following configurations:

```env
# Server
PORT=5000

# Upstash Redis (BullMQ)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# IPFS / Pinata
PINATA_API_KEY=your_api_key
PINATA_API_SECRET=your_api_secret
PINATA_JWT=your_jwt

# Blockchain
BASE_RPC_URL=your_rpc_url
ESCROW_CONTRACT_ADDRESS=your_contract_address

# Encryption & Pricing
MASTER_ENCRYPTION_KEY=your_secure_random_key
PRICE_PER_FRAME_ETH=0.0001
```

### 2. Backend Setup

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 4. Worker Setup

1. Navigate to the worker directory and set up a virtual environment:
   ```bash
   cd worker
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux/Mac:
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Run the worker dashboard:
   ```bash
   .\run_worker.bat
   ```

## ⚖️ License

Distributed under the ISC License. See `package.json` for more information.
