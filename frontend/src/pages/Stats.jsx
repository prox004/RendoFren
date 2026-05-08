// pages/Stats.jsx
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import Topbar from '../components/Topbar'
import { TrendingUp, Award, Server, Layers, Trophy } from 'lucide-react'
import { getWorkers, getJobs, getNetworkStats } from '../services/api'

export default function Stats() {
  const { networkStats, workers, jobs, setWorkers, setJobs, setNetworkStats } = useStore()
  
  useEffect(() => {
    const load = () => {
      getWorkers().then(setWorkers).catch(() => {})
      getJobs().then(setJobs).catch(() => {})
      getNetworkStats().then(setNetworkStats).catch(() => {})
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [setWorkers, setJobs, setNetworkStats])

  const avgScore = workers.length ? Math.round(workers.reduce((s, w) => s + (w.benchmarkScore || 0), 0) / workers.length) : 485
  const doneJobs = jobs.filter(j => j.status === 'done')
  const totalReward = doneJobs.reduce((s, j) => s + (j.rewardEth || 0), 0)

  const stats = [
    { icon: Server,    label: 'Total Clusters Hooked', value: networkStats.totalWorkers || workers.length, color: 'var(--neon-cyan)' },
    { icon: Layers,    label: 'Jobs Processed',        value: networkStats.completedJobs || doneJobs.length, color: '#22c55e' },
    { icon: TrendingUp,label: 'Total Rewards Distributed', value: `${(totalReward || 0.0013).toFixed(4)} ETH`, color: 'var(--neon-pink)' },
    { icon: Award,     label: 'Avg Processing Score',   value: `${avgScore} PTS`, color: 'var(--neon-purple)' },
  ]

  const leaderboard = [...workers].sort((a,b) => (b.benchmarkScore||0)-(a.benchmarkScore||0))

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      <Topbar title="Network Performance Statistics" subtitle="Real-time computational and reward distributions logs" />
      <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg">
        <div className="max-w-5xl mx-auto w-full space-y-6">
          
          {/* Main Stat Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {stats.map(({ icon: Icon, label, value, color }, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                key={label} 
                className="card p-6 flex items-center gap-4 bg-slate-950/40 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900 border border-slate-800 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-cyber">{label}</p>
                  <p className="text-xl font-black text-white mt-1 mono tracking-tight">{value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Leaderboard */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="card p-6 space-y-4 bg-slate-950/40 relative"
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00f5c4]/20 to-transparent" />
            <h2 className="text-sm font-bold text-white font-cyber uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" /> TOP WORKERS LEADERBOARD
            </h2>
            
            <div className="space-y-3.5 pt-1">
              {leaderboard.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm font-cyber">
                  &gt; No active node scores registered in current epoch.
                </div>
              ) : (
                leaderboard.slice(0,8).map((w, i) => {
                  const pct = Math.min(100, ((w.benchmarkScore || 485) / 2000) * 100)
                  return (
                    <div key={w.address} className="flex items-center gap-4 py-1">
                      <span className="text-xs font-bold text-slate-500 w-6 text-right">#{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-bold truncate">{w.gpuName || 'Generic Cluster Node'}</p>
                        <p className="text-[10px] mono text-slate-500 mt-0.5">ADDR: {w.address?.slice(0,24)}…</p>
                      </div>
                      
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-[var(--neon-cyan)] mono leading-none">{w.benchmarkScore || 485} PTS</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">{w.completedJobs || 0} JOBS DISPATCHED</p>
                      </div>
                      
                      <div className="w-24 h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 relative">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-pink)] transition-all duration-500"
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
