# Render Deployment Guide - RendoFren Backend

To deploy the RendoFren backend to [Render](https://render.com), follow these steps to ensure the API, job queue, and encryption systems function correctly.

## 1. Create a Web Service

1. **New > Web Service** on your Render Dashboard.
2. Connect your GitHub repository.
3. Configure the following:
   - **Name**: `rendofren-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` (This runs `node src/server.js`)

## 2. Environment Variables

Add the following variables in the **Environment** tab. Reference your `.env` for production values:

| Key | Example/Notes |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render sets this automatically, but good to have) |
| `UPSTASH_REDIS_REST_URL` | Your Redis URL for BullMQ |
| `UPSTASH_REDIS_REST_TOKEN` | Your Redis Token |
| `PINATA_API_KEY` | For IPFS Storage |
| `PINATA_API_SECRET` | For IPFS Storage |
| `PINATA_JWT` | For IPFS Storage |
| `MASTER_ENCRYPTION_KEY` | **Critical**: Must be a 32-character string |
| `BASE_RPC_URL` | e.g., Base Sepolia or Mainnet RPC |
| `ESCROW_CONTRACT_ADDRESS` | Deployed contract address |

## 3. Storage & Cleanup

The backend uses local directories (`uploads/`, `renders/`, `exports/`) for temporary processing.
- Render's disk is **ephemeral**. Files will be deleted on every deploy or restart.
- Since RendoFren uses **IPFS (Pinata)** for long-term storage, this is usually fine for a development/hackathon version.
- **Health Check**: Set the health check path to `/health`.

## 4. System Dependencies (FFmpeg)

RendoFren uses `ffmpeg` for stitching frames into videos. 
- The project includes `@ffmpeg-installer/ffmpeg`, which should detect the Render Linux environment.
- If video export fails, add the **FFmpeg Buildpack** in **Settings > Buildpacks**:
  - `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`

## 5. Webhook / Socket.io Note
Ensure you use the assigned `.onrender.com` URL for your Frontend and Worker node configurations so they can communicate with the deployed API.
