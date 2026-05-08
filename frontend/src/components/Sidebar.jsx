// components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Upload, Cpu, BarChart3, Layers, Zap, WalletCards } from 'lucide-react'
import { useStore } from '../store/useStore'

const nav = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/upload',   icon: Upload,          label: 'Upload Job'  },
  { to: '/jobs',     icon: Layers,          label: 'All Jobs'    },
  { to: '/nodes',    icon: Cpu,             label: 'Node Network'},
  { to: '/stats',    icon: BarChart3,       label: 'Statistics'  },
  { to: '/rewards',  icon: WalletCards,     label: 'Withdraw'    },
]

export default function Sidebar() {
  const { socketConnected, networkStats } = useStore()

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-white/4 bg-[#020617]/50 backdrop-blur-2xl relative z-20">
      {/* Logo Section */}
      <div className="p-8">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-[#00f5c4] opacity-20 blur-xl animate-pulse" />
            <div className="relative w-12 h-12 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center glow-cyan backdrop-blur-md">
              <Zap className="w-6 h-6 text-[#00f5c4]" />
            </div>
          </div>
          <div>
            <div className="font-cyber font-bold text-white text-xl leading-tight tracking-tight">RendoFren</div>
            <div className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase mt-1">Decentralized GPU</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3.5 px-5 py-3.5 rounded-2xl text-[13px] font-semibold transition-all duration-300 group
              ${isActive
                ? 'bg-white/4 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/2'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-2 rounded-xl transition-colors ${isActive ? 'bg-[#00f5c4]/10 text-[#00f5c4]' : 'bg-transparent group-hover:bg-white/4'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span>{label}</span>
                {isActive && (
                  <motion.div layoutId="activeNav" className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_10px_#00f5c4]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Network Footer */}
      <div className="p-6 mt-auto">
        <div className="card p-5 bg-white/2 border border-white/4 rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Network Live</span>
            <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-[#00f5c4] shadow-[0_0_10px_#00f5c4]' : 'bg-red-500'}`} />
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total Nodes</span>
              <span className="text-xs font-bold text-white mono">{networkStats.activeWorkers || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Active Jobs</span>
              <span className="text-xs font-bold text-white mono">{networkStats.activeJobs || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
