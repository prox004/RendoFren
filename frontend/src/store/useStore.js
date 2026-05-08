// store/useStore.js — Zustand global state
import { create } from 'zustand'

export const useStore = create((set) => ({
  // ── Network ─────────────────────────────────────────────
  networkStats: {
    totalWorkers: 0, activeWorkers: 0, idleWorkers: 0,
    totalJobs: 0, pendingJobs: 0, activeJobs: 0,
    completedJobs: 0, failedJobs: 0,
  },
  workers: [],
  jobs: [],
  socketConnected: false,

  setNetworkStats: (stats) => set({ networkStats: stats }),
  setWorkers: (workers) => set({ workers }),
  setJobs: (jobs) => set({ jobs }),
  setSocketConnected: (v) => set({ socketConnected: v }),

  upsertJob: (updatedJob) => set((state) => {
    const idx = state.jobs.findIndex(j => j.id === updatedJob.id || j.id === updatedJob.jobId)
    if (idx >= 0) {
      const jobs = [...state.jobs]
      jobs[idx] = { ...jobs[idx], ...updatedJob }
      return { jobs }
    }
    return { jobs: [updatedJob, ...state.jobs] }
  }),

  updateJobStatus: (jobId, status, extra = {}) => set((state) => ({
    jobs: state.jobs.map(j =>
      (j.id === jobId || j.id === jobId) ? { ...j, status, ...extra } : j
    )
  })),

  updateJobProgress: (jobId, progress) => set((state) => ({
    jobs: state.jobs.map(j => j.id === jobId ? { ...j, progress } : j)
  })),

  // ── Upload / Current Job ────────────────────────────────
  currentUploadJob: null,
  setCurrentUploadJob: (job) => set({ currentUploadJob: job }),

  // ── Wallet & Auth ───────────────────────────────────────
  walletAddress: null,
  walletConnected: false,
  user: null,
  setWallet: (address) => set({ walletAddress: address, walletConnected: !!address }),
  setUser: (user) => set({ user }),
}))
