// sockets/socket.js — Singleton Socket.io client
import { io } from 'socket.io-client'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export const socket = io(BACKEND, {
  query: { role: 'client' },
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 2000,
  extraHeaders: {
    "ngrok-skip-browser-warning": "true"
  }
})

export default socket
