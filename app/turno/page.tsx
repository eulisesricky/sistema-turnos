'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function TurnoContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [turno, setTurno] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const [audioActive, setAudioActive] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const alertPlayedRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setError('No se encontró el token.')
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/turno?token=${token}`)
        const data = await res.json()
        if (data.error) {
          setError(data.error)
        } else {
          setTurno(data)
          setTimeLeft(data.remainingSeconds || 0)
        }
      } catch {
        setError('Error al cargar el turno.')
      }
      setLoading(false)
    }

    fetchData()
  }, [token])

  const handleActivateAudio = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = ctx
      setAudioActive(true)
      alertPlayedRef.current = false
    } catch (e) {
      console.error('Error activating audio:', e)
    }
  }

  const playAlert = () => {
    try {
      const ctx = audioContextRef.current
      if (!ctx) return
      
      let time = ctx.currentTime
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.4, time)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4)
        osc.start(time)
        osc.stop(time + 0.4)
        time += 0.6
      }
      
      if (navigator.vibrate) {
        navigator.vibrate([400, 200, 400, 200, 400, 200, 400, 200, 400])
      }
    } catch {}
  }

  useEffect(() => {
    if (timeLeft === 0 && audioActive && !alertPlayedRef.current) {
      alertPlayedRef.current = true
      playAlert()
    }
  }, [timeLeft, audioActive])

  useEffect(() => {
    if (timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [timeLeft])

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(Math.floor(timeLeft % 60)).padStart(2, '0')

  if (loading) return <div style={{color:'white',textAlign:'center',padding:'2rem'}}>Cargando...</div>
  if (error) return <div style={{color:'white',textAlign:'center',padding:'2rem'}}>{error}</div>

  const statusMap: Record<string,string> = {
    waiting: 'En espera',
    called: '¡Tu turno está listo!',
    completed: 'Completado',
    cancelled: 'Cancelado'
  }

  return (
    <div style={{minHeight:'100vh',background:'#0a1628',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{textAlign:'center',color:'white',width:'100%',maxWidth:'400px'}}>
        <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.8rem',marginBottom:'0.5rem'}}>NÚMERO DE TURNO</p>
        <h1 style={{fontSize:'5rem',fontWeight:'900',margin:'0',lineHeight:'1'}}>{turno.turn_number}</h1>
        <p style={{fontSize:'1.2rem',fontWeight:'600',margin:'1rem 0 0.5rem'}}>{turno.customer_name}</p>
        <p style={{fontSize:'0.9rem',color:'#94a3b8',margin:'0 0 2rem'}}>{statusMap[turno.status] || turno.status}</p>
        <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.7rem',marginBottom:'0.5rem'}}>TIEMPO RESTANTE</p>
        <h2 style={{fontSize:'4rem',fontWeight:'900',color:'#4ade80',margin:'0'}}>{mins}:{secs}</h2>
        {!audioActive && (
          <button
            onClick={handleActivateAudio}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.3s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
          >
            🔔 Activar alerta sonora
          </button>
        )}
        {timeLeft === 0 && (
          <div style={{marginTop:'2rem',padding:'1.5rem',background:'#064e3b',borderRadius:'1rem',color:'white'}}>
            <p style={{fontSize:'1.8rem',fontWeight:'900',margin:'0 0 0.5rem 0'}}>¡ORDEN LISTA!</p>
            <p style={{fontSize:'0.9rem',margin:'0',color:'#d1d5db'}}>Acércate a retirar tu pedido</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TurnoPage() {
  return (
    <Suspense fallback={<div style={{color:'white',textAlign:'center',padding:'2rem'}}>Cargando...</div>}>
      <TurnoContent />
    </Suspense>
  )
}
