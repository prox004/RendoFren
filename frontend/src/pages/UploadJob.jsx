import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Upload, FileArchive, X, ShieldCheck, CheckCircle, ChevronRight, Lock } from 'lucide-react'
import { useStore } from '../store/useStore'
import { uploadBlend, confirmEscrow } from '../services/api'
import Topbar from '../components/Topbar'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { ethers } from 'ethers'


const Input = ({ label, ...props }) => (
  <div className="space-y-3">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">{label}</label>
    <input 
      className="w-full bg-white/[0.03] border border-white/[0.05] rounded-2xl px-5 py-4 text-sm text-white focus:border-[var(--neon-cyan)] focus:bg-[var(--neon-cyan)]/5 outline-none transition-all" 
      {...props} 
    />
  </div>
)

const Select = ({ label, children, ...props }) => (
  <div className="space-y-3">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">{label}</label>
    <select 
      className="w-full bg-white/[0.03] border border-white/[0.05] rounded-2xl px-5 py-4 text-sm text-white focus:border-[var(--neon-cyan)] transition-all appearance-none cursor-pointer outline-none" 
      {...props}
    >
      {children}
    </select>
  </div>
)

const parseBlendSettings = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target.result)
        
        // Verify .blend file header
        if (buf.length < 12) return reject(new Error('Invalid .blend file size.'))
        const header = String.fromCharCode(...buf.slice(0, 7))
        if (header !== 'BLENDER') return reject(new Error('Not a valid Blender file.'))
        
        const is64 = buf[7] === 45; // '-' char code for 64-bit
        let pos = 12
        
        while (pos < buf.length) {
          if (pos + 20 > buf.length) break
          
          // Read Block Code (4 bytes)
          let code = ''
          for (let i = 0; i < 4; i++) {
            const char = buf[pos + i]
            if (char !== 0) code += String.fromCharCode(char)
          }
          code = code.trim()
          
          // Read Block Size (LE 32-bit int)
          const size = buf[pos + 4] | (buf[pos + 5] << 8) | (buf[pos + 6] << 16) | (buf[pos + 7] << 24)
          const addrSize = is64 ? 8 : 4
          
          const blockHeaderSize = 4 + 4 + addrSize + 4 + 4
          const dataPos = pos + blockHeaderSize
          
          if (code === 'SC') {
            // Found Scene block! Confirm it's large enough for RenderData offsets
            if (size >= 896 && dataPos + size <= e.target.result.byteLength) {
              const dataView = new DataView(e.target.result, dataPos, size)
              
              const startFrame = dataView.getInt32(836, true)
              const endFrame = dataView.getInt32(840, true)
              const resX = dataView.getInt32(888, true)
              const resY = dataView.getInt32(892, true)
              
              // Validate that numbers look like valid frames & resolution dimensions
              if (startFrame >= 0 && endFrame > startFrame && resX > 0 && resY > 0) {
                return resolve({
                  startFrame,
                  endFrame,
                  resolution: `${resX}x${resY}`
                })
              }
            }
          }
          
          pos += blockHeaderSize + size
        }
        reject(new Error('No active Scene block (SC) discovered.'))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file buffer.'))
    reader.readAsArrayBuffer(file)
  })
}

export default function UploadJob() {
  const navigate = useNavigate()
  const { authenticated, user, login } = usePrivy()
  const { wallets } = useWallets()
  const { setCurrentUploadJob } = useStore()
  const walletAddress = user?.wallet?.address
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [settings, setSettings] = useState({ 
    startFrame: 1, 
    endFrame: 10, 
    resolution: '1920x1080', 
    samples: 128, 
    exportFormat: 'mp4',
    encryptionKey: 'rendofren_pass'
  })
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [result, setResult] = useState(null)
  const [detectionLog, setDetectionLog] = useState('')
  const [web3Status, setWeb3Status] = useState('')
  
  const [speedPriority, setSpeedPriority] = useState('standard')
  const [customReward, setCustomReward] = useState(0.0042)

  const getCostEstimation = useCallback(() => {
    const start = parseInt(settings.startFrame) || 1
    const end = parseInt(settings.endFrame) || 1
    const frameCount = Math.max(1, end - start + 1)
    const sampleCount = parseInt(settings.samples) || 128

    let resMultiplier = 1.0
    if (settings.resolution === '1280x720') resMultiplier = 0.44
    else if (settings.resolution === '1920x1080') resMultiplier = 1.0
    else if (settings.resolution === '3840x2160') resMultiplier = 4.0
    else {
      const parts = settings.resolution.split('x').map(Number)
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        resMultiplier = (parts[0] * parts[1]) / (1920 * 1080)
      }
    }

    const fileSizeMB = file ? (file.size / 1024 / 1024) : 10 // Default to 10MB
    const fileFactor = 1.0 + (fileSizeMB * 0.015) // 1.5% premium per MB for transfer load

    const basePricePerFrame = 0.0001
    // Localhost customization: flat pricing model per job, do not multiply by frameCount!
    const recommended = basePricePerFrame * resMultiplier * (sampleCount / 128) * fileFactor

    // Suggested minimum and maximum ranges
    const min = recommended * 0.6
    const max = recommended * 2.2

    return {
      recommended: parseFloat(recommended.toFixed(6)),
      min: parseFloat(min.toFixed(6)),
      max: parseFloat(max.toFixed(6)),
      frameCount,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2))
    }
  }, [settings.startFrame, settings.endFrame, settings.resolution, settings.samples, file])

  const est = getCostEstimation()
  let currentReward = est.recommended
  if (speedPriority === 'eco') {
    currentReward = est.min
  } else if (speedPriority === 'turbo') {
    currentReward = est.max
  } else if (speedPriority === 'custom') {
    currentReward = customReward
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.blend') || f.name.endsWith('.zip'))) {
      setFile(f)
    }
  }, [])

  useEffect(() => {
    if (!file) {
      setTimeout(() => setDetectionLog(''), 0)
      return
    }
    
    if (file.name.endsWith('.blend')) {
      setTimeout(() => setDetectionLog('Scanning .blend file metadata...'), 0)
      parseBlendSettings(file)
        .then((parsed) => {
          setTimeout(() => {
            setSettings(s => ({
              ...s,
              startFrame: parsed.startFrame,
              endFrame: parsed.endFrame,
              resolution: parsed.resolution
            }))
            setDetectionLog(`Auto-detected: ${parsed.resolution}, Frames ${parsed.startFrame}-${parsed.endFrame}`)
          }, 0)
        })
        .catch((err) => {
          console.warn('Failed to auto-detect scene settings:', err)
          setTimeout(() => setDetectionLog('Standard configurations initialized.'), 0)
        })
    } else {
      setTimeout(() => setDetectionLog(''), 0)
    }
  }, [file])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setPhase('uploading')
    setWeb3Status('Encrypting scene and uploading asset payload to IPFS...')

    const form = new FormData()
    form.append('file', file)
    
    // Append settings and Web3 pricing metadata
    Object.entries({ 
      ...settings, 
      creatorWallet: walletAddress || 'anonymous',
      rewardEth: currentReward.toString(),
      speedPriority: speedPriority
    }).forEach(([k, v]) => form.append(k, v))

    try {
      // 1. Upload and pre-register job in backend
      const res = await uploadBlend(form)
      setResult(res)

      // 2. Perform real Base Sepolia on-chain lock transaction
      let activeWallet = wallets[0]
      if (!activeWallet && user?.wallet) {
        setWeb3Status('Initializing secure Web3 wallet connection...')
        // Wait up to 3 seconds for wallets hook to synchronize
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 500))
          if (wallets && wallets.length > 0) {
            activeWallet = wallets[0]
            break
          }
        }
      }

      if (activeWallet) {
        setWeb3Status('Connecting wallet & initializing escrow deployment contract...')
        
        try {
          // Automatic network switch to Base Sepolia (84532) if on another network
          const currentChainId = activeWallet.chainId
          const targetChainId = 'eip155:84532'
          if (currentChainId !== targetChainId && currentChainId !== '84532' && currentChainId !== 84532) {
            setWeb3Status('Switching wallet network to Base Sepolia (Chain 84532)...')
            try {
              await activeWallet.switchChain(84532)
              // Wait briefly for network switch to complete in provider
              await new Promise(r => setTimeout(r, 1000))
            } catch (switchError) {
              console.warn('Network switch rejected or failed:', switchError)
            }
          }

          const ethereumProvider = await activeWallet.getEthereumProvider()
          const provider = new ethers.BrowserProvider(ethereumProvider)
          const signer = await provider.getSigner()
          
          const contractAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS || '0xa1dE7B6CCc0f52F5CBF442fAd0E70E964E817D02'
          const contract = new ethers.Contract(contractAddress, [
            "function lockJobEscrow(string calldata jobId, string calldata assetCid) external payable"
          ], signer)

          const costEth = res.rewardEth || currentReward
          setWeb3Status(`Awaiting signature to deposit on-chain reward (${costEth} ETH) on Base Sepolia...`)

          // Send transaction
          const tx = await contract.lockJobEscrow(res.jobId, res.assetCid, {
            value: ethers.parseEther(costEth.toString())
          })

          setWeb3Status(`Transaction sent! Waiting for 1 on-chain block confirmation (Hash: ${tx.hash.slice(0, 16)}...)`)
          const receipt = await tx.wait()
          
          res.txHash = tx.hash
        } catch (blockchainError) {
          console.warn('Real on-chain transaction was skipped or failed:', blockchainError)
          
          // Custom beautiful confirmation to proceed with high-fidelity simulation if funds are low
          const proceed = window.confirm(
            `Smart Contract Escrow Lock could not be completed on Base Sepolia (Reason: ${blockchainError.message || 'No funds/Rejected'}).\n\nWould you like to dispatch the job utilizing RendoFren's secure Developer Sandbox Escrow Simulation to keep your render pipeline fully active for this demo?`
          )
          
          if (!proceed) {
            setPhase('error')
            setUploading(false)
            return
          }
          
          // Simulated transaction hash to allow rendering to proceed
          res.txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
        }
      } else {
        // Display an explicit consent dialog instead of silently bypassing
        const proceedSandbox = window.confirm(
          "We could not detect an active connected Web3 wallet.\n\nWould you like to deploy this swarm utilizing RendoFren's secure Developer Sandbox Escrow Simulation to process your frames immediately?"
        )
        if (!proceedSandbox) {
          setPhase('error')
          setUploading(false)
          return
        }
        
        setWeb3Status('No active Privy wallet session found. Activating Sandbox Simulation...')
        await new Promise(r => setTimeout(r, 1500))
        res.txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
      }

      // 3. Confirm the escrow deposit with the backend to transition status to 'pending'
      setWeb3Status('Registering escrow confirmation on RendoFren database...')
      const confirmedRes = await confirmEscrow(res.jobId, res.txHash)

      setCurrentUploadJob(confirmedRes.job)
      setResult(confirmedRes.job)
      setPhase('done')
    } catch (e) {
      console.error(e)
      setPhase('error')
    }
    setUploading(false)
  }

  if (!authenticated) {
    return (
      <div className="flex-1 flex flex-col h-full bg-slate-950">
        <Topbar title="Submit Asset" subtitle="Deploy your assets to the GPU swarm" />
        <div className="flex-1 flex items-center justify-center grid-bg pt-20">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-12 max-w-lg w-full text-center space-y-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Authentication Required</h2>
              <p className="text-slate-400 text-sm leading-relaxed">Please connect your wallet to access the upload terminal and dispatch jobs to the network.</p>
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

  if (phase === 'done') return (
    <div className="flex-1 flex items-center justify-center bg-slate-950 grid-bg">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card p-12 max-w-lg w-full text-center space-y-8"
      >
        <div className="w-20 h-20 rounded-3xl bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-[var(--neon-cyan)]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Pipeline Deployed</h2>
          <p className="text-slate-400 text-sm leading-relaxed">Your project has been encrypted and dispatched to the GPU swarm.</p>
        </div>
        <div className="bg-white/[0.02] rounded-2xl p-6 text-left space-y-4 border border-white/[0.04]">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Job ID</span>
            <span className="text-white mono font-bold">{result?.jobId?.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between items-center text-xs pt-4 border-t border-white/[0.04]">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Escrow Reward</span>
            <span className="text-[var(--neon-cyan)] mono font-bold">{result?.estimate?.estimatedCostEth} ETH</span>
          </div>
        </div>
        <button 
          onClick={() => navigate('/jobs')} 
          className="w-full py-5 rounded-2xl bg-white text-black font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
        >
          View Live Progress <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      {phase === 'uploading' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-12 max-w-md w-full text-center space-y-6 bg-slate-900/90 border border-slate-800"
          >
            <div className="w-16 h-16 border-4 border-[var(--neon-cyan)] border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_15px_rgba(0,245,196,0.2)]" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white font-cyber tracking-wide">SECURE PIPELINE DISPATCH</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed mono">{web3Status}</p>
            </div>
          </motion.div>
        </div>
      )}
      <Topbar title="Deploy Swarm Pipeline" subtitle="Initialize a secure distributed rendering sequence via the RendoFren GPU network." />
      <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg">
        <div className="max-w-6xl mx-auto w-full">

        <div className="grid grid-cols-1 lg:grid-cols-6 gap-8">
          <div className="lg:col-span-4 space-y-8">
            {/* Drop Zone */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`
                relative p-12 rounded-2xl border border-dashed transition-all duration-500 text-center group
                ${dragging ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/5 scale-[1.01]' : 'border-white/[0.08] hover:border-white/[0.15] bg-white/[0.01]'}
                ${file ? 'border-none p-0 !bg-transparent' : ''}
              `}
            >
              {!file ? (
                <>
                  <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.05] group-hover:scale-110 transition-transform">
                    <Upload className="w-10 h-10 text-slate-400 group-hover:text-[var(--neon-cyan)] transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Initialize Source</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">.blend or .zip archives</p>
                  <input type="file" onChange={(e) => setFile(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" />
                </>
              ) : (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#00f5c4]/10 flex items-center justify-center">
                    <FileArchive className="w-10 h-10 text-[#00f5c4]" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-lg font-bold text-white truncate mb-1">{file.name}</p>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-slate-500 font-bold mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      {detectionLog && (
                        <p className="text-[10px] text-[#00f5c4] font-semibold mono flex items-center gap-1.5 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4]" /> {detectionLog}
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setFile(null)} className="p-4 rounded-2xl hover:bg-white/[0.05] transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <Input label="Start Frame" type="number" value={settings.startFrame} onChange={(e) => setSettings(s => ({ ...s, startFrame: e.target.value }))} />
              <Input label="End Frame" type="number" value={settings.endFrame} onChange={(e) => setSettings(s => ({ ...s, endFrame: e.target.value }))} />
              <Select label="Output Format" value={settings.resolution} onChange={(e) => setSettings(s => ({ ...s, resolution: e.target.value }))}>
                 <option value="1280x720">720p (1280x720)</option>
                 <option value="1920x1080">1080p (1920x1080)</option>
                 <option value="3840x2160">4K (3840x2160)</option>
                 {!['1280x720', '1920x1080', '3840x2160'].includes(settings.resolution) && (
                   <option value={settings.resolution}>Custom ({settings.resolution})</option>
                 )}
              </Select>
              <Input label="Sampling Rate" type="number" value={settings.samples} onChange={(e) => setSettings(s => ({ ...s, samples: e.target.value }))} />
            </div>
          </div>

          <aside className="lg:col-span-2">
            <div className="card p-6 bg-white/[0.015] border-white/[0.04] sticky top-12 rounded-2xl space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Cost Breakdown</h3>
                <p className="text-xs text-slate-500">Based on file payload & render parameters</p>
              </div>

              {/* Dynamic Factors Breakdown */}
              <div className="space-y-4 bg-white/[0.01] rounded-2xl p-4 border border-white/[0.03]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Render Length</span>
                  <span className="text-white font-medium mono">{est.frameCount} frame{est.frameCount > 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Payload Weight</span>
                  <span className="text-white font-medium mono">{est.fileSizeMB} MB</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Resolution Multiplier</span>
                  <span className="text-white font-medium mono">
                    {settings.resolution === '3840x2160' ? '4.00x (4K)' : settings.resolution === '1280x720' ? '0.44x (720p)' : '1.00x (1080p)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Sampling Density</span>
                  <span className="text-white font-medium mono">{(parseInt(settings.samples) || 128) / 128}x</span>
                </div>
              </div>

              {/* Speed Preset Selector Grid */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] ml-0.5">Speed Priority presets</h4>
                <div className="grid grid-cols-3 gap-2">
                  {/* Eco Option */}
                  <button
                    type="button"
                    onClick={() => setSpeedPriority('eco')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      speedPriority === 'eco' 
                        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300' 
                        : 'border-white/[0.05] bg-white/[0.01] text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wider">Eco</span>
                    <span className="text-[9px] font-semibold opacity-80 mt-0.5 block">🐢 {est.min}</span>
                  </button>

                  {/* Standard Option */}
                  <button
                    type="button"
                    onClick={() => setSpeedPriority('standard')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      speedPriority === 'standard' 
                        ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]' 
                        : 'border-white/[0.05] bg-white/[0.01] text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wider">Normal</span>
                    <span className="text-[9px] font-semibold opacity-80 mt-0.5 block">⚖️ {est.recommended}</span>
                  </button>

                  {/* Turbo Option */}
                  <button
                    type="button"
                    onClick={() => setSpeedPriority('turbo')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      speedPriority === 'turbo' 
                        ? 'border-[var(--neon-pink)] bg-[var(--neon-pink)]/10 text-[var(--neon-pink)]' 
                        : 'border-white/[0.05] bg-white/[0.01] text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wider">Turbo</span>
                    <span className="text-[9px] font-semibold opacity-80 mt-0.5 block">⚡ {est.max}</span>
                  </button>
                </div>
              </div>

              {/* Direct Custom Reward Override Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center ml-0.5">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Custom Reward (ETH)</h4>
                  {speedPriority === 'custom' && (
                    <span className="text-[9px] text-[var(--neon-cyan)] font-bold uppercase tracking-widest animate-pulse">Active Override</span>
                  )}
                </div>
                <input 
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  placeholder="e.g. 0.0001"
                  value={speedPriority === 'custom' ? customReward : parseFloat(currentReward.toFixed(6))}
                  onChange={(e) => {
                    setSpeedPriority('custom')
                    setCustomReward(parseFloat(e.target.value) || 0.0001)
                  }}
                  className={`w-full bg-white/[0.03] border rounded-2xl px-5 py-4 text-sm text-white outline-none transition-all mono font-bold ${
                    speedPriority === 'custom' ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10' : 'border-white/[0.05]'
                  }`}
                />
              </div>

              {/* Dynamic Dispatch Speed Explanation Notification Card */}
              <div className={`p-4 rounded-xl text-xs leading-relaxed border transition-all ${
                speedPriority === 'eco' 
                  ? 'border-yellow-500/10 bg-yellow-500/[0.03] text-yellow-500/90' 
                  : speedPriority === 'turbo' 
                  ? 'border-[var(--neon-pink)]/10 bg-[var(--neon-pink)]/[0.03] text-[var(--neon-pink)]/90' 
                  : 'border-[var(--neon-cyan)]/10 bg-[var(--neon-cyan)]/[0.03] text-[var(--neon-cyan)]/90'
              }`}>
                {speedPriority === 'eco' && (
                  <p>🐢 <strong>Eco-Class Allocation:</strong> Render offer is kept at minimum. Your job will wait in the mempool for entry-level workers (GTX 1050/RX 570) to pick it up. Expected rendering times are slower.</p>
                )}
                {speedPriority === 'standard' && (
                  <p>⚖️ <strong>Standard Balanced Allocation:</strong> Balanced reward-to-compute ratio. Dispatched directly across standard nodes with fair queue priority. Recommended for standard timelines.</p>
                )}
                {speedPriority === 'turbo' && (
                  <p>⚡ <strong>Turbo Flagship Allocation:</strong> Maximum reward density. Instantly commands premium high-end/flagship nodes (RTX 4090/3090/3080) for real-time parallel computing.</p>
                )}
                {speedPriority === 'custom' && (
                  <p>⚙️ <strong>Custom Reward Level:</strong> You have custom configured the reward to <strong className="mono">{currentReward} ETH</strong>. Nodes will bid and queue your job based on this specific reward density.</p>
                )}
              </div>

              {/* Total Fee Metrics Panel */}
              <div className="pt-4 border-t border-white/[0.04] space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Reward Escrow</p>
                    <p className={`text-2xl font-bold mono transition-colors ${
                      speedPriority === 'eco' ? 'text-yellow-400' : speedPriority === 'turbo' ? 'text-[var(--neon-pink)]' : 'text-[var(--neon-cyan)]'
                    }`}>
                      {parseFloat(currentReward.toFixed(6))} ETH
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Network Fee</p>
                    <p className="text-sm font-semibold text-slate-300 mono">0.0001 ETH</p>
                  </div>
                </div>
              </div>

              {/* Passphrase Card */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="w-4 h-4 text-[var(--neon-pink)]" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Encryption Key</span>
                </div>
                <input 
                  type="text" 
                  value={settings.encryptionKey}
                  onChange={(e) => setSettings(s => ({ ...s, encryptionKey: e.target.value }))}
                  className="w-full bg-transparent text-xs font-bold text-white mono outline-none border-b border-white/[0.05] pb-1 focus:border-[var(--neon-cyan)] transition-colors"
                />
              </div>

              <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full py-4 rounded-xl bg-white text-black font-bold text-sm uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-20 shadow-[0_20px_40px_rgba(255,255,255,0.05)]"
              >
                {uploading ? 'Encrypting...' : 'Deploy Swarm'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
  )
}
