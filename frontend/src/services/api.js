// services/api.js — Axios API client
import axios from 'axios'

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export const getNetworkStats   = () => api.get('/network/stats').then(r => r.data)
export const getJobs          = () => api.get('/jobs').then(r => r.data.jobs || r.data)
export const getJob           = (id) => api.get(`/jobs/${id}`).then(r => r.data)
export const getWorkers       = () => api.get('/workers').then(r => r.data.workers || r.data)
export const estimateCost     = (payload) => api.post('/estimate', payload).then(r => r.data)

// Mock Blockchain APIs
export const getBlockchainStats = () => api.get('/blockchain/stats').then(r => r.data)
export const getBlockchainLogs  = () => api.get('/blockchain/logs').then(r => r.data)
export const getWorkerRewards   = (address) => api.get(`/blockchain/rewards/${address}`).then(r => r.data)

// Auth APIs
export const generateApiKey = (payload) => api.post('/auth/generate-key', payload).then(r => r.data)

export const uploadBlend = (formData, onProgress) =>
  axios.post(`${BACKEND_URL}/api/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded / e.total) * 100)),
    timeout: 300000,
  }).then(r => r.data)

export const confirmEscrow = (id, txHash) =>
  api.post(`/jobs/${id}/confirm-escrow`, { txHash }).then(r => r.data)

export default api
