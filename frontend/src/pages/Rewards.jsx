// pages/Rewards.jsx
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Info, ArrowUpRight, CheckCircle2, Coins, Timer, Layers3, Flame, Activity } from 'lucide-react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { ethers } from 'ethers'
import { getWorkerRewards } from '../services/api'
import Topbar from '../components/Topbar'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
})

export default function Rewards() {
  const { user, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const [rewards, setRewards] = useState(null)
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const walletAddress = user?.wallet?.address

  useEffect(() => {
    if (authenticated && walletAddress) {
      getWorkerRewards(walletAddress)
        .then(data => {
          setRewards(data)
          setLoading(false)
        })
        .catch(err => {
          console.error('Failed to fetch rewards:', err)
          setLoading(false)
        })
    } else if (!authenticated) {
      setLoading(false)
    }
  }, [authenticated, walletAddress])

  const handleWithdraw = async () => {
    setWithdrawing(true)
    setErrorMessage('')
    setWithdrawn(false)
    setTxHash('')

    try {
      const activeWallet = wallets[0]
      if (!activeWallet) {
        throw new Error('No connected wallet found in your session. Please bind a wallet.')
      }

      const ethereumProvider = await activeWallet.getEthereumProvider()
      const provider = new ethers.BrowserProvider(ethereumProvider)
      const signer = await provider.getSigner()

      const contractAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS || '0xa1dE7B6CCc0f52F5CBF442fAd0E70E964E817D02'
      const contract = new ethers.Contract(contractAddress, [
        "function withdrawEarnings() external"
      ], signer)

      console.log('Sending withdrawal transaction...')
      const tx = await contract.withdrawEarnings()
      setTxHash(tx.hash)

      console.log('Awaiting transaction confirmation...')
      await tx.wait()
      
      setWithdrawn(true)
      setRewards(prev => ({ ...prev, availableToWithdraw: 0 }))
    } catch (err) {
      console.error('Withdrawal transaction failed:', err)
      setErrorMessage(err.reason || err.message || 'Transaction rejected or failed.')
    } finally {
      setWithdrawing(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="flex-1 flex flex-col bg-[#020617]">
        <Topbar title="Node Rewards" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-white/3 border border-white/8 flex items-center justify-center mb-6">
            <Wallet className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-2xl font-cyber font-bold text-white mb-2">Authentication Required</h2>
          <p className="text-slate-400 max-w-sm mb-8">Please log in to view your node rewards and withdraw earned tokens.</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all font-bold text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#020617]/30">
      <Topbar title="Node Rewards" />
      
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <motion.div {...fadeUp(0)} className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#00f5c4] glow-cyan shadow-[0_0_10px_#00f5c4] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00f5c4]">Earning Dashboard</span>
            </div>
            <h1 className="text-4xl font-cyber font-black text-white tracking-tight">Financial Hub</h1>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Total Distributed</div>
            <div className="text-xl font-mono text-white">42.859 <span className="text-slate-500">ETH</span></div>
          </div>
        </motion.div>

        {/* Main Rewards Card */}
        <motion.div {...fadeUp(0.1)} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 p-8 rounded-4xl bg-linear-to-br from-white/4 to-transparent border border-white/6 backdrop-blur-3xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-8">
                <Coins className="w-16 h-16 text-white/3 -rotate-12 group-hover:text-[#00f5c4]/5 transition-colors duration-700" />
             </div>
             
             <div className="relative z-10">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Available for Withdrawal</div>
                <div className="flex items-baseline gap-4 mb-8">
                  <span className="text-7xl font-mono font-black text-white tracking-tighter">
                    {loading ? '---' : rewards?.availableToWithdraw?.toFixed(4) || '0.0000'}
                  </span>
                  <span className="text-xl font-cyber font-bold text-[#00f5c4]">Base Sepolia ETH</span>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-4">
                    {withdrawn ? (
                       <div className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4] font-bold">
                          <CheckCircle2 className="w-5 h-5" />
                          Withdrawal Successful
                       </div>
                    ) : (
                      <button 
                        onClick={handleWithdraw}
                        disabled={withdrawing || !rewards?.availableToWithdraw}
                        className="px-10 py-5 bg-[#00f5c4] hover:brightness-110 disabled:opacity-50 disabled:grayscale text-black font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_40px_rgba(102,252,241,0.2)] flex items-center gap-3"
                      >
                        {withdrawing ? 'Processing TX...' : 'Withdraw Rewards'}
                        {!withdrawing && <ArrowUpRight className="w-5 h-5" />}
                      </button>
                    )}
                    
                    <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-slate-400 text-sm italic">
                      <Info className="w-4 h-4" />
                      Gas fees are covered by RendoFren Protocol
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-5 py-3 rounded-2xl max-w-xl">
                      {errorMessage}
                    </div>
                  )}

                  {txHash && (
                    <div className="text-xs font-mono text-slate-400 bg-white/2 border border-white/5 px-5 py-3 rounded-2xl flex items-center justify-between gap-4 max-w-xl">
                      <span className="truncate">Tx: {txHash}</span>
                      <a 
                        href={`https://sepolia.basescan.org/tx/${txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[#00f5c4] hover:underline shrink-0 font-bold font-cyber"
                      >
                        View on Basescan
                      </a>
                    </div>
                  )}
                </div>
             </div>
          </div>

          <div className="p-8 rounded-4xl bg-linear-to-br from-white/2 to-transparent border border-white/4 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center mb-6">
                <Wallet className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Connected Wallet</div>
              <div className="text-lg font-mono text-white truncate">{walletAddress || 'Not Connected'}</div>
            </div>
            
            <div className="pt-6 border-t border-white/4 mt-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-500 text-xs font-bold uppercase">Network</span>
                <span className="text-white text-xs font-bold px-2 py-1 rounded-md bg-white/5">Base Sepolia</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs font-bold uppercase">Status</span>
                <span className="text-[#00f5c4] text-xs font-bold flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00f5c4]" /> Linked
                </span>
              </div>
            </div>
          </div>

        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Frames Rendered', value: rewards?.numFrames || 0, icon: Layers3, color: 'cyan' },
            { label: 'Avg Render Time', value: `${rewards?.avgTime || 0}s`, icon: Timer, color: 'blue' },
            { label: 'Token / Frame', value: rewards?.tokenPerFrame || 0, icon: Flame, color: 'orange' },
            { label: 'Total Value Generated', value: `${((rewards?.numFrames || 0) * (rewards?.tokenPerFrame || 0)).toFixed(4)} ETH`, icon: Activity, color: 'purple' },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label} 
              {...fadeUp(0.2 + i * 0.05)}
              className="p-6 rounded-3xl bg-white/2 border border-white/4 hover:border-white/8 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl bg-white/3 text-slate-400`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{stat.label}</div>
              <div className="text-2xl font-mono text-white font-bold">{loading ? '---' : stat.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Info Box */}
        <motion.div {...fadeUp(0.5)} className="p-6 rounded-3xl bg-linear-to-r from-blue-500/5 to-purple-500/5 border border-white/4 flex gap-6 items-center">
           <div className="w-14 h-14 rounded-2xl bg-white/3 shrink-0 flex items-center justify-center">
              <Info className="w-6 h-6 text-blue-400" />
           </div>
           <div>
              <h4 className="text-white font-bold mb-1">Proof of Work Verification</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                 Rewards are calculated based on successful frame submissions validated by the coordinator. 
                 Withdrawn tokens are transferred directly to your bound wallet on the Base Sepolia network.
              </p>
           </div>
        </motion.div>

      </div>
    </div>
  )
}
