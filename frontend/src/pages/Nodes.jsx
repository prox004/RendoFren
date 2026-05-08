// pages/Nodes.jsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, Thermometer, HardDrive, Activity, Zap, Server, ActivitySquare, Lock } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getWorkers, getNetworkStats } from '../services/api'
import Topbar from '../components/Topbar'
import { usePrivy } from '@privy-io/react-auth'

function WorkerCard({ worker, idx, now }) {
  const isActive = new Date(worker.lastSeen) > new Date(now - 30000)
  const statusColor = { 
    idle: 'var(--neon-cyan)', 
    rendering: 'var(--neon-pink)', 
    offline: '#64748b' 
  }
  const color = isActive ? (statusColor[worker.status] || 'var(--neon-cyan)') : '#64748b'
  const score = worker.benchmarkScore || 120
  const tier = score >= 5000 ? 'Flagship' : score >= 2000 ? 'High-End' : score >= 600 ? 'Mid-Range' : 'Entry'

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="card p-5 space-y-4 bg-slate-950/40 border-slate-900 relative"
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00f5c4]/15 to-transparent" />
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 border border-slate-800 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <Cpu className="w-5 h-5" style={{ color }} />
            </div>
            {isActive && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--neon-cyan)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--neon-cyan)]"></span>
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{worker.gpuName || 'Unknown Cluster Node'}</p>
            <p className="text-[10px] mono text-slate-500 mt-0.5">ADDR: {worker.address?.slice(0, 18)}…</p>
          </div>
        </div>
        
        <span className="text-[10px] px-2.5 py-1 rounded-md border font-extrabold uppercase tracking-widest"
          style={{ color, borderColor: `${color}30`, background: `${color}06` }}>
          {isActive ? worker.status : 'offline'}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: Zap,         label: 'Benchmark',  value: `${score} PTS`,          color: 'var(--neon-cyan)' },
          { icon: HardDrive,   label: 'VRAM Capacity',   value: `${worker.vram || 3}GB`, color: 'var(--neon-purple)' },
          { icon: Activity,    label: 'Jobs Filled',   value: worker.completedJobs || 0, color: 'var(--neon-pink)' },
          { icon: Thermometer, label: 'Temperature',   value: worker.temperature ? `${worker.temperature}°C` : '46°C', color: '#fb923c' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="p-2.5 rounded-xl border border-slate-900 bg-slate-950/60 text-center space-y-1">
            <Icon className="w-4 h-4 mx-auto" style={{ color }} />
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide font-cyber">{label}</p>
            <p className="text-xs font-extrabold text-white mono">{value}</p>
          </div>
        ))}
      </div>

      {/* Tier + last seen */}
      <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-900/40 pt-3">
        <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-300 font-cyber">
          {tier} Tier GPU
        </span>
        <span className="font-semibold text-[10px] font-cyber uppercase">Last active: {new Date(worker.lastSeen).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  )
}

export default function Nodes() {
  const { workers, networkStats, setWorkers, setNetworkStats } = useStore()
  const { authenticated, login } = usePrivy()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!authenticated) return;
    const load = () => {
      getWorkers().then(setWorkers).catch(() => {})
      getNetworkStats().then(setNetworkStats).catch(() => {})
    }
    load()
    const t = setInterval(load, 5000)
    const t2 = setInterval(() => setNow(Date.now()), 10000)
    return () => {
      clearInterval(t)
      clearInterval(t2)
    }
  }, [setWorkers, setNetworkStats, authenticated])

  if (!authenticated) {
    return (
      <div className="flex flex-col h-full bg-slate-950 relative">
        <Topbar title="Hardware Swarm" subtitle="Live telemetry from authenticated GPU clusters" />
        <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg flex flex-col items-center justify-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-12 max-w-lg w-full text-center space-y-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/20 flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-[var(--neon-cyan)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Protocol Decryption Required</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Connect your identity to scan the network for active rendering nodes and view hardware telemetry.
              </p>
            </div>
            <button 
              onClick={login} 
              className="w-full py-5 rounded-2xl bg-white text-black font-bold text-sm uppercase tracking-widest hover:scale-[1.02] transition-transform"
            >
              Connect Wallet
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  const active = workers.filter(w => new Date(w.lastSeen) > new Date(now - 30000))
  const offline = workers.filter(w => new Date(w.lastSeen) <= new Date(now - 30000))

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      <Topbar title="Hardware Node Network" subtitle="Connected GPU computing clusters" />
      <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg">
        <div className="max-w-6xl mx-auto w-full space-y-6">
          
          {/* Summary Panels */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: 'Total Nodes',   value: networkStats.totalWorkers || 0,  color: '#94a3b8' },
              { label: 'Online Nodes',  value: networkStats.activeWorkers || 0,  color: 'var(--neon-cyan)' },
              { label: 'Idle Workers',  value: networkStats.idleWorkers || 0,    color: '#22c55e' },
              { label: 'Rendering Jobs',value: networkStats.activeJobs || 0,     color: 'var(--neon-pink)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-5 text-center relative overflow-hidden bg-slate-950/40">
                <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
                <p className="text-3xl font-black mono tracking-tight text-white">{value}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-cyber mt-1.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Active nodes */}
          <AnimatePresence>
            {active.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-black text-[var(--neon-cyan)] uppercase tracking-widest font-cyber flex items-center gap-2">
                  <ActivitySquare className="w-4 h-4" /> Active Cluster Nodes ({active.length})
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {active.map((w, i) => <WorkerCard key={w.address} worker={w} idx={i} now={now} />)}
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* Offline nodes */}
          <AnimatePresence>
            {offline.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest font-cyber flex items-center gap-2">
                  <Server className="w-4 h-4" /> Disconnected / Hibernating Nodes ({offline.length})
                </h2>
                <div className="grid grid-cols-2 gap-4 opacity-40">
                  {offline.map((w, i) => <WorkerCard key={w.address} worker={w} idx={i} now={now} />)}
                </div>
              </div>
            )}
          </AnimatePresence>

          {workers.length === 0 && (
            <div className="card p-20 text-center text-slate-500 border-dashed font-cyber">
              &gt; No worker nodes currently registered. Run the Python CLI daemon script on a device to hook.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
