// pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
// eslint-disable-next-line no-unused-vars
import { Cpu, Layers, CheckCircle, Activity, Server, Database, Key, ArrowUpRight, Copy, Terminal } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getJobs, getWorkers, getBlockchainStats, getBlockchainLogs, generateApiKey } from '../services/api'
import Topbar from '../components/Topbar'
// eslint-disable-next-line no-unused-vars
import { usePrivy } from '@privy-io/react-auth'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
})

function WalletBindingPrompt() {
  // eslint-disable-next-line no-unused-vars
  const { user, linkWallet, animated } = usePrivy()
  const [apiKey, setApiKey] = useState(null)
  const [loading, setLoading] = useState(false)

  const hasWallet = user?.linkedAccounts?.some(acc => acc.type === 'wallet')

  const handleGenerateKey = async () => {
    setLoading(true)
    try {
      const emailAccount = user.linkedAccounts.find(a => a.type === 'email')
      const walletAccount = user.linkedAccounts.find(a => a.type === 'wallet')
      const resp = await generateApiKey({
        userId: user.id,
        address: walletAccount?.address || '',
        email: emailAccount?.address || ''
      })
      setApiKey(resp.apiKey)
    } catch (err) {
      console.error('Failed to generate API Key:', err)
      alert('Failed to generate key. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  if (!hasWallet) {
    return (
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl bg-linear-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20 mb-6 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 pulse">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-bold tracking-tight">Wallet Connection Required</h3>
            <p className="text-slate-400 text-sm">To start rendering and earn rewards, bind your MetaMask or Coinbase wallet.</p>
          </div>
        </div>
        <button onClick={linkWallet} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
          Connect & Bind Wallet
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-2xl bg-linear-to-r from-[#00f5c4]/10 to-blue-500/5 border border-[#00f5c4]/20 mb-6 flex items-center justify-between backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#00f5c4]/20 flex items-center justify-center text-[#00f5c4]">
          <CheckCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-white font-bold tracking-tight">Account Fully Managed</h3>
          <p className="text-slate-400 text-sm">Wallet bound: <span className="text-[#00f5c4] mono font-bold">{user.wallet?.address.slice(0, 6)}...{user.wallet?.address.slice(-4)}</span></p>
        </div>
      </div>
      
      {!apiKey ? (
        <button onClick={handleGenerateKey} disabled={loading} className="px-6 py-2.5 bg-slate-900 border border-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all">
          {loading ? 'Generating...' : 'Generate Worker API Key'}
        </button>
      ) : (
        <div className="flex gap-2 items-center">
          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-[#00f5c4]/40 font-mono text-[11px] text-[#00f5c4] select-all">
            {apiKey}
          </div>
          <button onClick={() => navigator.clipboard.writeText(apiKey)} className="p-2.5 bg-slate-900 rounded-xl text-slate-400 hover:text-white border border-slate-800">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

function LandingHero() {
  const { login } = usePrivy()
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-16">
      <motion.div {...fadeUp(0.1)} className="space-y-6 max-w-2xl">
        <h2 className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-[0.9] font-cyber">
          DECENTRALIZED <br /> 
          <span className="text-transparent bg-clip-text bg-linear-to-r from-[#00f5c4] to-[#676FFF]">GPU POWER</span>
        </h2>
        <p className="text-slate-400 text-lg font-medium leading-relaxed">
          The high-performance render network for creators. Secure, encrypted, and decentralized.
        </p>
        <button 
          onClick={login}
          className="group relative px-8 py-4 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="absolute inset-0 bg-white/20 blur-xl group-hover:blur-2xl transition-all rounded-2xl opacity-0 group-hover:opacity-100" />
          <span className="relative flex items-center gap-2">
            Launch Application <ArrowUpRight className="w-4 h-4" />
          </span>
        </button>
      </motion.div>
      
      {/* Visual background element */}
      <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-[#676FFF]/10 rounded-full blur-[120px]" />
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <motion.div
      {...fadeUp(0.05)}
      className="card p-6 relative overflow-hidden group hover:border-slate-800 transition-all duration-300 flex flex-col justify-between"
    >
      {/* Decorative Accent Glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-5 blur-xl group-hover:opacity-10 transition-opacity duration-500"
        style={{ background: color }}
      />
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-cyber">{label}</p>
          <p className="font-black text-white tracking-tight mono" style={{ fontSize: '26px', lineHeight: '32px' }}>{value}</p>
          {sub && <p className="text-[11px] text-slate-500 font-medium">{sub}</p>}
        </div>
        <div
          className="p-3 rounded-xl border border-slate-800/60 transition-all duration-300 group-hover:scale-110 shrink-0"
          style={{ background: `${color}06`, borderColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </motion.div>
  )
}

function JobRow({ job }) {
  const statusColor = {
    pending: 'text-yellow-400 bg-yellow-400/5 border-yellow-400/10',
    queued: 'text-blue-400 bg-blue-400/5 border-blue-400/10',
    rendering: 'text-(--neon-cyan) bg-(--neon-cyan)/5 border-(--neon-cyan)/20',
    assembling: 'text-purple-400 bg-purple-400/5 border-purple-400/10',
    done: 'text-green-400 bg-green-400/5 border-green-400/10',
    failed: 'text-red-400 bg-red-400/5 border-red-400/10',
  }

  return (
    <div className="group flex items-center gap-6 p-6 hover:bg-white/2 transition-all duration-300 border-b border-white/2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <p className="text-sm font-bold text-white mono truncate">{job.id?.slice(0, 12)}...</p>
          <div className={`text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-widest ${statusColor[job.status]}`}>
            {job.status}
          </div>
        </div>
        <p className="text-xs text-slate-500 font-medium">
          {job.resolution} · {job.samples} samples · <span className="text-slate-400 mono">{job.startFrame}-{job.endFrame}</span>
        </p>
      </div>

      <div className="hidden md:flex flex-col items-end gap-2 w-48">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{job.progress || 0}%</span>
        </div>
        <div className="w-full h-1 rounded-full bg-white/3 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-(--neon-cyan) to-(--neon-blue) transition-all duration-500"
            style={{ width: `${job.progress || 0}%` }}
          />
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white mono">{job.rewardEth?.toFixed(4)} ETH</p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Reward</p>
      </div>
    </div>
  )
}

function WorkerCard({ worker, now }) {
  const isActive = new Date(worker.lastSeen) > new Date(now - 30000)
  return (
    <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40 hover:border-slate-800 flex items-center gap-4 transition-all hover:translate-x-1 duration-200">
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-(--neon-cyan)' : 'bg-slate-600'}`} />
        {isActive && <div className="absolute inset-0 rounded-full bg-(--neon-cyan) ping-ring" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-bold truncate">{worker.gpuName}</p>
        <p className="text-[10px] text-slate-400 mono mt-0.5">ADDR: {worker.address?.slice(0, 14)}…</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-(--neon-cyan) glow-text-cyan mono">{worker.benchmarkScore} PTS</p>
        <p className="text-[10px] text-slate-400 tracking-wide uppercase font-bold mt-0.5">{worker.vram}GB VRAM</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { networkStats, jobs, workers, setJobs, setWorkers } = useStore()
  const { authenticated, ready, user } = usePrivy()
  const [bcStats, setBcStats] = useState(null)
  const [bcLogs, setBcLogs] = useState([])
  const [now, setNow] = useState(() => Date.now())

  const walletAddress = user?.wallet?.address

  useEffect(() => {
    if (!authenticated) return;
    const loadData = () => {
      getJobs().then(setJobs).catch(() => { })
      getWorkers().then(setWorkers).catch(() => { })
      getBlockchainStats().then(setBcStats).catch(() => { })
      getBlockchainLogs().then(setBcLogs).catch(() => { })
    }
    loadData()
    const t = setInterval(loadData, 5000)
    const t2 = setInterval(() => setNow(Date.now()), 10000)
    return () => {
      clearInterval(t)
      clearInterval(t2)
    }
  }, [setJobs, setWorkers, authenticated])

  const userJobs = jobs.filter(j => 
    walletAddress && j.creatorWallet?.toLowerCase() === walletAddress.toLowerCase()
  )
  const recentJobs = userJobs.slice(0, 5)
  const activeWorkers = workers.filter(w => new Date(w.lastSeen) > new Date(now - 30000))

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      <Topbar title="Network Dashboard" subtitle={authenticated ? "Real-time decentralized GPU render network overview" : "Welcome to RendoFren"} />
      <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg flex flex-col">
        {!ready ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-(--neon-cyan) border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !authenticated ? (
          <LandingHero />
        ) : (
          <div className="max-w-6xl mx-auto w-full space-y-6">
            <WalletBindingPrompt />

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard icon={Cpu} label="Active Nodes" value={networkStats.activeWorkers} color="#00f5c4" sub={`${networkStats.totalWorkers || 0} nodes registered`} />
              <StatCard icon={Layers} label="Total Jobs" value={networkStats.totalJobs} color="#3b82f6" sub={`${networkStats.pendingJobs || 0} queued in mempool`} />
              <StatCard icon={Activity} label="Rendering Now" value={networkStats.activeJobs} color="#a855f7" sub="active frame segments" />
              <StatCard icon={CheckCircle} label="Completed" value={networkStats.completedJobs} color="#22c55e" sub={`${networkStats.failedJobs || 0} jobs failed`} />
            </div>

            {/* Middle Row: Recent Jobs & Active Nodes */}
            <div className="grid grid-cols-3 gap-6">
              {/* Recent Jobs Panel */}
              <motion.div {...fadeUp(0.1)} className="col-span-2 card p-6 flex flex-col h-95 bg-slate-950/40 relative">
                <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-[#00f5c4]/20 to-transparent" />
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 font-cyber tracking-wide uppercase">
                    <Layers className="w-4 h-4 text-(--neon-cyan)" /> Recent Network Jobs
                  </h2>
                  <a href="/jobs" className="text-xs text-(--neon-cyan) hover:underline flex items-center gap-1 font-semibold">
                    Explore Mempool <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-1 scrollbar-thin">
                  {recentJobs.length === 0 ? (
                    <div className="font-mono text-[11px] text-slate-500 space-y-2 p-4 bg-slate-950/60 rounded-xl border border-slate-900/50 mt-4 leading-relaxed">
                      <div className="flex items-center gap-2"><span className="text-[#00f5c4]">●</span> [SYSTEM] Listening to mempool transactions...</div>
                      <div className="flex items-center gap-2"><span className="text-slate-600">○</span> [ORACLE] Oracle contract bound at {bcStats ? bcStats.contractAddress.slice(0, 8) : '0x'}...</div>
                      <div className="flex items-center gap-2 text-slate-600"><span className="animate-pulse">_</span> Waiting for distributed GPU swarm dispatches...</div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-900/60">{recentJobs.map(j => <JobRow key={j.id} job={j} />)}</div>
                  )}
                </div>
              </motion.div>

              {/* Active Nodes Panel */}
              <motion.div {...fadeUp(0.15)} className="card p-6 flex flex-col h-95 bg-slate-950/40 relative">
                <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-[#00f5c4]/20 to-transparent" />
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 font-cyber tracking-wide uppercase">
                    <span className="w-4 h-4 text-(--neon-cyan)"><Server className="w-4 h-4" /></span> Hardware Cluster
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-extrabold mono">{activeWorkers.length} ONLINE</span>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-2 scrollbar-thin">
                  {activeWorkers.length === 0 ? (
                    <div className="font-mono text-[11px] text-slate-500 space-y-2 p-4 bg-slate-950/60 rounded-xl border border-slate-900/50 mt-4 leading-relaxed">
                      <div className="flex items-center gap-2"><span className="text-[#ff2d78]">●</span> [DISCOVERY] Peer discovery protocol active (v1.0.4)</div>
                      <div className="flex items-center gap-2"><span className="text-slate-600">○</span> [EPOCH] Current block #{bcStats ? bcStats.currentBlock : '0'} active</div>
                      <div className="flex items-center gap-2 text-slate-600"><span className="animate-pulse">_</span> Waiting for worker node handshakes...</div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">{activeWorkers.map(w => <WorkerCard key={w.address} worker={w} now={now} />)}</div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Bottom Row: Escrow Ledger & State */}
            <div className="grid grid-cols-3 gap-6">
              {/* Transaction Ledger */}
              <motion.div {...fadeUp(0.2)} className="col-span-2 card p-6 flex flex-col h-95 bg-slate-950/40 relative">
                <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-[#ff2d78]/20 to-transparent" />
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 font-cyber tracking-wide uppercase">
                    <Database className="w-4 h-4 text-(--neon-pink)" /> Base Sepolia Escrow Ledger
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time smart contract state logs from off-chain oracle updates</p>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 pr-1 scrollbar-thin">
                  {bcLogs.length === 0 ? (
                    <div className="font-mono text-[11px] text-slate-500 space-y-2 p-4 bg-slate-950/60 rounded-xl border border-slate-900/50 mt-4 leading-relaxed">
                      <div className="flex items-center gap-2"><span className="text-[#a855f7]">●</span> [LEDGER] Querying smart contract block space...</div>
                      <div className="flex items-center gap-2"><span className="text-slate-600">○</span> [BRIDGE] WebSocket secure event bridge connected</div>
                      <div className="flex items-center gap-2 text-slate-600"><span className="animate-pulse">_</span> Monitoring decentralized reward state mutations...</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <AnimatePresence>
                        {bcLogs.map((log) => (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={log.id}
                            className="p-3.5 rounded-xl border border-slate-900 bg-slate-950/60 flex items-start gap-3 hover:border-slate-800 transition-all duration-200"
                          >
                            <div className="mt-1 w-2 h-2 rounded-full shrink-0 relative">
                              <div className="absolute inset-0 rounded-full animate-ping opacity-60"
                                style={{
                                  backgroundColor: log.type === 'JobCreated' ? '#facc15' :
                                    log.type === 'JobCompleted' ? '#22c55e' : '#ff2d78'
                                }}
                              />
                              <div className="relative w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: log.type === 'JobCreated' ? '#facc15' :
                                    log.type === 'JobCompleted' ? '#22c55e' : '#ff2d78'
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-white mono uppercase tracking-wider">{log.type}</span>
                                <span className="text-[10px] text-slate-500 font-bold mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-xs text-slate-300 mt-1.5 mono leading-relaxed">{log.msg}</p>
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 font-bold mono">
                                <span className="flex items-center gap-1">
                                  TX: <span className="text-(--neon-cyan) hover:underline cursor-pointer">{log.txHash?.slice(0, 16)}…</span>
                                </span>
                                <span className="text-slate-600">|</span>
                                <span>BLOCK: <span className="text-white">#{log.blockNumber}</span></span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Smart Contract State */}
              <motion.div {...fadeUp(0.25)} className="card p-6 flex flex-col justify-between h-95 bg-slate-950/40 relative">
                <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-[#a855f7]/25 to-transparent" />
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2 font-cyber tracking-wide uppercase">
                      <Key className="w-4 h-4 text-(--neon-purple)" /> Escrow Contract State
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">Verified Solidity code parameters</p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/80 space-y-1 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-radial from-(--neon-purple)/5 to-transparent pointer-events-none" />
                      <p className="text-[10px] uppercase text-slate-500 font-bold tracking-widest font-cyber">Current Escrow Balance</p>
                      <p className="text-2xl font-black text-white mono tracking-tight mt-0.5">
                        {bcStats ? bcStats.balanceEth.toFixed(4) : '0.0000'} <span className="text-sm font-extrabold text-(--neon-cyan) uppercase">ETH</span>
                      </p>
                    </div>

                    <div className="space-y-2 text-xs text-slate-400">
                      <div className="flex justify-between border-b border-slate-900 py-1.5">
                        <span className="font-medium text-slate-500">Block Height:</span>
                        <span className="text-white mono font-bold">#{bcStats ? bcStats.currentBlock : '0'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-900 py-1.5">
                        <span className="font-medium text-slate-500">Active Escrows:</span>
                        <span className="text-white font-bold">{jobs.filter(j => ['queued', 'rendering'].includes(j.status)).length}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="font-medium text-slate-500">Oracle Gas Price:</span>
                        <span className="text-white mono font-bold">0.15 Gwei</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <div className="text-[9px] text-slate-400 font-bold mono select-all break-all border border-dashed border-slate-800 p-3 rounded-xl bg-slate-950/60 leading-normal">
                    <span className="text-(--neon-purple) font-black uppercase tracking-wider block mb-1">Contract Address</span>
                    {bcStats ? bcStats.contractAddress : '0x'}
                  </div>

                  <a
                    href="https://sepolia.basescan.org/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold
                    border border-slate-900 text-slate-300 hover:text-white hover:border-slate-800 bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center"
                  >
                    Inspect BaseScan <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
