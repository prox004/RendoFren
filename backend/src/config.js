require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Upstash Redis REST (used as BullMQ broker via ioredis)
  REDIS_URL: process.env.UPSTASH_REDIS_REST_URL || '',
  REDIS_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',

  // IPFS / Pinata
  PINATA_API_KEY: process.env.PINATA_API_KEY || '',
  PINATA_API_SECRET: process.env.PINATA_API_SECRET || '',
  PINATA_JWT: process.env.PINATA_JWT || '',

  // Blockchain
  BASE_RPC_URL: process.env.BASE_RPC_URL || '',
  ESCROW_CONTRACT_ADDRESS: process.env.ESCROW_CONTRACT_ADDRESS || '',

  // Internal settings
  UPLOAD_DIR: require('path').join(__dirname, '../uploads'),
  RENDERS_DIR: require('path').join(__dirname, '../renders'),
  EXPORTS_DIR: require('path').join(__dirname, '../exports'),

  // Encryption
  MASTER_KEY: process.env.MASTER_ENCRYPTION_KEY || 'rendofren-dev-key-change-in-prod',

  // Cost model: base price per frame (in ETH)
  PRICE_PER_FRAME_ETH: parseFloat(process.env.PRICE_PER_FRAME_ETH || '0.0001'),
};
