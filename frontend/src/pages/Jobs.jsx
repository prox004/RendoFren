import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, RefreshCw, ExternalLink, ShieldAlert, Download, Key, CheckCircle, Loader2, Lock } from 'lucide-react'
import JSZip from 'jszip'
import { useStore } from '../store/useStore'
import { getJobs, BACKEND_URL } from '../services/api'
import Topbar from '../components/Topbar'
import { usePrivy } from '@privy-io/react-auth'

const STATUS_STYLES = {
  pending:    'text-yellow-400 bg-yellow-400/5 border-yellow-400/20 shadow-[0_0_15px_rgba(234,179,8,0.05)]',
  queued:     'text-blue-400 bg-blue-400/5 border-blue-400/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]',
  rendering:  'text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/5 border-[var(--neon-cyan)]/25 pulse-text-cyan shadow-[0_0_15px_rgba(0,245,196,0.1)]',
  assembling: 'text-purple-400 bg-purple-400/5 border-purple-400/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]',
  done:       'text-green-400 bg-green-400/5 border-green-400/20 shadow-[0_0_15px_rgba(34,197,94,0.05)]',
  failed:     'text-red-400 bg-red-400/5 border-red-400/20 shadow-[0_0_15px_rgba(239,68,68,0.05)]',
}

function JobCard({ job }) {
  const progress = job.progress || 0
  const frames = job.endFrame - job.startFrame + 1

  const [decrypting, setDecrypting] = useState(false)
  const [decrypted, setDecrypted] = useState(false)
  const [decryptError, setDecryptError] = useState(null)
  const [copied, setCopied] = useState(false)

  const [frameImages, setFrameImages] = useState([])
  const [loadingFrames, setLoadingFrames] = useState(false)
  const [previewActive, setPreviewActive] = useState(false)
  const [activeFrameIdx, setActiveFrameIdx] = useState(0)

  useEffect(() => {
    return () => {
      frameImages.forEach(img => {
        URL.revokeObjectURL(img.url)
      })
    }
  }, [frameImages])

  const loadFramePreviews = async () => {
    setLoadingFrames(true)
    setDecryptError(null)
    try {
      const url = `${BACKEND_URL}/api/jobs/download/${job.resultCid}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const fileData = await response.arrayBuffer()
      
      const iv = fileData.slice(0, 16)
      const ciphertext = fileData.slice(16)
      const keyHash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(job.encryptionKey))
      const aesKey = await window.crypto.subtle.importKey('raw', keyHash, { name: 'AES-CBC' }, false, ['decrypt'])
      const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext)
      
      const zip = await JSZip.loadAsync(decryptedBuffer)
      const imageFiles = []
      
      for (const [filename, file] of Object.entries(zip.files)) {
        if (filename.toLowerCase().endsWith('.png') || filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
          const blob = await file.async('blob')
          const imgUrl = URL.createObjectURL(blob)
          imageFiles.push({ name: filename, url: imgUrl })
        }
      }
      
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      
      if (imageFiles.length === 0) {
        throw new Error("No PNG/JPG frame images found in the result archive.")
      }
      
      setFrameImages(imageFiles)
      setActiveFrameIdx(0)
      setPreviewActive(true)
    } catch (err) {
      console.error("Frame previews error:", err)
      setDecryptError(`Failed to load frame previews: ${err.message}`)
    } finally {
      setLoadingFrames(false)
    }
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(job.encryptionKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadAndDecrypt = async () => {
    setDecrypting(true)
    setDecryptError(null)
    setDecrypted(false)
    try {
      const url = `${BACKEND_URL}/api/jobs/download/${job.resultCid}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const fileData = await response.arrayBuffer()
      const iv = fileData.slice(0, 16)
      const ciphertext = fileData.slice(16)
      const keyHash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(job.encryptionKey))
      const aesKey = await window.crypto.subtle.importKey('raw', keyHash, { name: 'AES-CBC' }, false, ['decrypt'])
      const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext)
      const blob = new Blob([decryptedBuffer], { type: 'application/zip' })
      const dlUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = dlUrl; a.download = `render_${job.id.slice(0, 8)}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(dlUrl)
      setDecrypted(true)
    } catch (err) {
      setDecryptError(err.message)
    } finally {
      setDecrypting(false)
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }}
      className="card p-6 flex flex-col gap-5 group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[var(--neon-cyan)] to-[var(--neon-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-cyber">Job Identifier</span>
            <span className="mono text-xs text-[var(--neon-cyan)] font-extrabold select-all">{job.id}</span>
          </div>
          <h3 className="text-base text-white font-black tracking-tight mt-1">
            Frames {job.startFrame}–{job.endFrame} · <span className="text-slate-400 font-semibold">{frames} segment frames</span> · {job.resolution}
          </h3>
        </div>
        <span className={`text-[10px] px-3 py-1 rounded-md border font-extrabold uppercase tracking-widest flex-shrink-0 ${STATUS_STYLES[job.status] || 'text-gray-400'}`}>
          {job.status}
        </span>
      </div>

      {/* Progress Monitor */}
      {['queued','rendering','assembling'].includes(job.status) && (
        <div className="space-y-2 bg-slate-950/80 p-4 rounded-xl border border-slate-900">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-bold font-cyber tracking-wider uppercase">Segment Progress</span>
            <span className="text-[var(--neon-cyan)] font-extrabold mono">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-900 overflow-hidden relative progress-shimmer border border-slate-800">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-pink)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      )}

      {/* Dynamic Specifications */}
      <div className="grid grid-cols-4 gap-3 text-xs bg-slate-950/30 p-3 rounded-xl border border-slate-900/40 font-medium">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block font-cyber">Samples</span>
          <span className="text-slate-300 font-bold mono">{job.samples} cycles</span>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block font-cyber">Secured reward</span>
          <span className="text-[var(--neon-cyan)] font-bold mono">{job.rewardEth?.toFixed(4)} ETH</span>
        </div>
        <div className="space-y-0.5 col-span-2">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block font-cyber">Hardware Dispatch</span>
          <span className="text-slate-300 font-bold truncate block mono">
            {job.assignedWorker ? `NODE: ${job.assignedWorker.slice(0,18)}…` : 'PENDING ORACLE ALLOCATION'}
          </span>
        </div>
      </div>

      {/* Security Credentials Block */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-900 text-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-[var(--neon-purple)] opacity-20" />
        <div className="flex items-center gap-3 pl-2">
          <Key className="w-4 h-4 text-[var(--neon-purple)]" />
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-cyber leading-none">Security Cipher Passphrase</span>
            <span className="mono text-white text-xs font-bold mt-1 tracking-widest">{job.encryptionKey}</span>
          </div>
        </div>
        <button 
          onClick={handleCopyKey} 
          className="text-xs font-bold font-cyber text-[var(--neon-purple)] hover:text-white border border-[var(--neon-purple)]/20 hover:border-[var(--neon-purple)]/60 px-3 py-1.5 rounded-lg bg-[var(--neon-purple)]/5 hover:bg-[var(--neon-purple)]/15 transition-all"
        >
          {copied ? 'COPIED!' : 'COPY CIPHER'}
        </button>
      </div>

      {/* Decrypted Frame Viewer */}
      {previewActive && frameImages.length > 0 && (
        <div className="space-y-4 bg-slate-950/80 p-5 rounded-2xl border border-white/[0.05] mt-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-[var(--neon-cyan)] font-bold uppercase tracking-widest font-cyber">Decrypted Output Specimen</span>
              <span className="text-xs text-white font-black mt-0.5">{frameImages[activeFrameIdx]?.name} ({activeFrameIdx + 1} of {frameImages.length})</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setActiveFrameIdx(prev => (prev - 1 + frameImages.length) % frameImages.length)}
                className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-[var(--neon-cyan)] text-white hover:text-[var(--neon-cyan)] transition-all cursor-pointer font-bold text-xs"
              >
                ◀ PREV
              </button>
              <button 
                onClick={() => setActiveFrameIdx(prev => (prev + 1) % frameImages.length)}
                className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-[var(--neon-cyan)] text-white hover:text-[var(--neon-cyan)] transition-all cursor-pointer font-bold text-xs"
              >
                NEXT ▶
              </button>
            </div>
          </div>

          {/* Large active frame */}
          <div className="relative aspect-video rounded-xl overflow-hidden border border-white/[0.03] bg-black/40 flex items-center justify-center group/img">
            <img 
              src={frameImages[activeFrameIdx]?.url} 
              alt={frameImages[activeFrameIdx]?.name} 
              className="max-h-full max-w-full object-contain"
            />
            <a 
              href={frameImages[activeFrameIdx]?.url} 
              download={frameImages[activeFrameIdx]?.name}
              className="absolute bottom-3 right-3 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white hover:text-[var(--neon-cyan)] opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 border border-white/[0.05] flex items-center gap-1.5 text-[10px] font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> SAVE FRAME
            </a>
          </div>

          {/* Thumbnail strip */}
          {frameImages.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto py-1 scrollbar-thin">
              {frameImages.map((img, idx) => (
                <button
                  key={img.name}
                  onClick={() => setActiveFrameIdx(idx)}
                  className={`w-16 aspect-video rounded-lg overflow-hidden border flex-shrink-0 transition-all cursor-pointer ${idx === activeFrameIdx ? 'border-[var(--neon-cyan)] scale-[1.05] shadow-[0_0_8px_rgba(0,245,196,0.25)]' : 'border-white/[0.05] hover:border-white/[0.2] opacity-60 hover:opacity-100'}`}
                >
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions and Result Area */}
      {job.status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-900/60">
          <div className="flex gap-3">
            <button
              onClick={downloadAndDecrypt}
              disabled={decrypting}
              className={`btn-cyber py-3 px-5 text-xs flex items-center justify-center gap-2 cursor-pointer
                ${decrypted ? 'btn-cyber-cyan' : 'btn-cyber-pink'}`}
            >
              {decrypting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  DOWNLOADING &amp; DECRYPTING TARGET ZIP...
                </>
              ) : decrypted ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  DECRYPTED &amp; SAVED SUCCESS!
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  DECRYPT &amp; SAVE IN-BROWSER (.ZIP)
                </>
              )}
            </button>

            {!previewActive ? (
              <button
                onClick={loadFramePreviews}
                disabled={loadingFrames}
                className="btn-cyber btn-cyber-cyan py-3 px-5 text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingFrames ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    UNZIPPING CIPHER TARGET...
                  </>
                ) : (
                  <>
                    <Layers className="w-3.5 h-3.5" />
                    PREVIEW SECURED FRAMES ({frames})
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setPreviewActive(false)}
                className="btn-cyber border-white/[0.05] text-slate-400 py-3 px-5 text-xs flex items-center justify-center gap-2 hover:text-white cursor-pointer"
              >
                HIDE PREVIEWS
              </button>
            )}
          </div>
          
          <a
            href={`https://gateway.pinata.cloud/ipfs/${job.resultCid}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-[var(--neon-cyan)] transition-colors py-2 px-3 rounded-lg border border-transparent hover:border-slate-800"
          >
            <ExternalLink className="w-4 h-4" /> INSPECT ENCRYPTED BINARY
          </a>
        </div>
      )}

      {decryptError && (
        <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/15 text-red-400 text-xs flex items-center gap-2.5 font-cyber font-bold leading-normal">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>CRYPTO FAILURE: {decryptError}</span>
        </div>
      )}
    </motion.div>
  )
}

export default function Jobs() {
  const { jobs, setJobs } = useStore()
  const { authenticated, login, user } = usePrivy()
  const walletAddress = user?.wallet?.address

  const load = useCallback(() => {
    if (!authenticated) return;
    getJobs().then(setJobs).catch(() => {})
  }, [setJobs, authenticated])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  if (!authenticated) {
    return (
      <div className="flex flex-col h-full bg-slate-950 relative">
        <Topbar title="Secure Swarm Pipelines" subtitle="Decentralized pipeline dispatch logs and localized frame decryption" />
        <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg flex flex-col items-center justify-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-12 max-w-lg w-full text-center space-y-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-[#676FFF]/10 border border-[#676FFF]/20 flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-[#676FFF]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Vault Access Required</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Log in to view your distributed render pipelines and decrypt task results locally in-browser.
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

  const userJobs = jobs.filter(j => 
    walletAddress && j.creatorWallet?.toLowerCase() === walletAddress.toLowerCase()
  )

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      <Topbar title="Secure Swarm Pipelines" subtitle="Decentralized pipeline dispatch logs and localized frame decryption" />
      <div className="flex-1 overflow-y-auto pt-24 px-8 pb-8 grid-bg">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          
          {/* List Headers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-400 font-cyber uppercase tracking-wider">
              <Layers className="w-4 h-4 text-[var(--neon-cyan)] animate-pulse" /> {userJobs.length} total dispatches
            </div>
            <button 
              onClick={load} 
              className="flex items-center gap-2 text-xs font-bold font-cyber px-4 py-2 rounded-xl border border-slate-900 bg-slate-950/40 text-slate-300 hover:text-white hover:border-slate-800 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5"/> REFRESH MEMPOOL
            </button>
          </div>
          
          <AnimatePresence mode="popLayout">
            {userJobs.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="py-32 text-center card bg-transparent border-dashed border-white/[0.05]"
              >
                <Layers className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">No pipelines dispatched by your wallet. Click "New Pipeline" to start.</p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {userJobs.map(j => <JobCard key={j.id} job={j} />)}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
