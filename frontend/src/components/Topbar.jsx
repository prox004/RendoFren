// components/Topbar.jsx
import { Wallet, Wifi, WifiOff, LogIn, LogOut, ChevronDown, User as UserIcon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect } from 'react'

export default function Topbar({ title, subtitle }) {
  const { walletAddress, walletConnected, setWallet, socketConnected, user: storeUser, setUser } = useStore()
  const { login, logout, authenticated, user, ready } = usePrivy()
  const { wallets } = useWallets()

      // Sync Privy auth & wallet state to store
  useEffect(() => {
    if (ready) {
      setUser(authenticated ? user : null)
      
      // Only set wallet if it's explicitly linked to the account or connected
      // We look for a 'wallet' type in linkedAccounts to ensure it's "bound"
      const isBound = user?.linkedAccounts?.some(acc => acc.type === 'wallet')
      const activeWallet = isBound ? (wallets.find(w => w.address) || user?.wallet) : null

      if (activeWallet?.address) {
        setWallet(activeWallet.address)
      } else {
        setWallet(null)
      }
    }
  }, [ready, authenticated, user, wallets, setUser, setWallet])

  const truncate = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ''

  return (
    <header className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-8 border-b border-white/[0.04] bg-[#05070a]/80 backdrop-blur-md flex-shrink-0 z-30">
      <div>
        <h1 className="text-white font-bold text-base leading-tight tracking-tight font-cyber uppercase">{title}</h1>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Socket status */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          {socketConnected
            ? <Wifi className="w-3.5 h-3.5 text-[#00f5c4]" />
            : <WifiOff className="w-3.5 h-3.5 text-red-500" />
          }
          <span className="text-xs text-slate-400 font-medium">{socketConnected ? 'Live' : 'Disconnected'}</span>
        </div>

        {authenticated ? (
          <div className="flex items-center gap-3">
            {/* Wallet Status / Connector */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all
              ${walletConnected 
                ? 'bg-[#00f5c4]/5 border-[#00f5c4]/20 text-[#00f5c4]' 
                : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:border-white/10 clickable'}`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{walletConnected ? truncate(walletAddress) : 'No Wallet'}</span>
            </div>

            {/* User Profile / Logout */}
            <div className="flex items-center gap-2 group relative">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#676FFF] to-[#00f5c4] flex items-center justify-center">
                  <UserIcon className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs text-slate-300 font-medium hidden md:block">
                  {user?.email?.address || truncate(user?.wallet?.address)}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              {/* Dropdown Menu */}
              <div className="absolute top-full right-0 mt-2 w-48 py-2 bg-[#0d1117] border border-white/[0.08] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="px-4 py-2 border-b border-white/[0.04] mb-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Authenticated</p>
                  <p className="text-[11px] text-[#00f5c4] truncate font-medium">{user?.id}</p>
                </div>
                <button 
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={login}
            disabled={!ready}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-[#676FFF] to-[#515ae0] hover:from-[#515ae0] hover:to-[#4049d1] text-white text-xs font-bold tracking-wider uppercase transition-all duration-300 shadow-lg shadow-[#676FFF]/20 active:scale-[0.98] disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5" />
            Launch App
          </button>
        )}
      </div>
    </header>
  )
}
