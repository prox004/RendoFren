// App.jsx — Root application with router, socket bridge, and layout
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import UploadJob from './pages/UploadJob'
import Jobs from './pages/Jobs'
import Nodes from './pages/Nodes'
import Stats from './pages/Stats'
import Rewards from './pages/Rewards'
import { useStore } from './store/useStore'
import { socket } from './sockets/socket'
import { getNetworkStats } from './services/api'

export default function App() {
  const { setNetworkStats, setWorkers, setSocketConnected, upsertJob, updateJobStatus, updateJobProgress } = useStore()

  useEffect(() => {
    // Initial load
    getNetworkStats().then(setNetworkStats).catch(() => {})

    // Socket event handlers
    socket.on('connect',    () => setSocketConnected(true))
    socket.on('disconnect', () => setSocketConnected(false))

    socket.on('network:stats', setNetworkStats)
    socket.on('workers:list', setWorkers)

    socket.on('jobs:list', (jobs) => {
      jobs.forEach(j => upsertJob(j))
    })

    socket.on('job:status', ({ jobId, status, ...extra }) => {
      updateJobStatus(jobId, status, extra)
    })

    socket.on('job:progress', ({ jobId, progress }) => {
      updateJobProgress(jobId, progress)
    })

    socket.on('job:completed', ({ jobId, resultCid }) => {
      updateJobStatus(jobId, 'done', { resultCid, progress: 100 })
      getNetworkStats().then(setNetworkStats).catch(() => {})
    })

    socket.on('job:failed', ({ jobId, error }) => {
      updateJobStatus(jobId, 'failed', { error })
    })

    // Poll network stats every 10s as fallback
    const t = setInterval(() => getNetworkStats().then(setNetworkStats).catch(() => {}), 10000)

    return () => {
      clearInterval(t)
      socket.off('connect'); socket.off('disconnect')
      socket.off('network:stats'); socket.off('workers:list'); socket.off('jobs:list')
      socket.off('job:status'); socket.off('job:progress')
      socket.off('job:completed'); socket.off('job:failed')
    }
  }, [setNetworkStats, setWorkers, setSocketConnected, upsertJob, updateJobStatus, updateJobProgress])

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/"       element={<Dashboard />} />
            <Route path="/upload" element={<UploadJob />} />
            <Route path="/jobs"   element={<Jobs />} />
            <Route path="/nodes"  element={<Nodes />} />
            <Route path="/stats"  element={<Stats />} />
            <Route path="/rewards" element={<Rewards />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
