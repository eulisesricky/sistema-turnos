'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_VERSION } from '@/lib/version'

function TurnoContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [turno, setTurno] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [audioActive, setAudioActive] = useState(false)
  const [calledByStaff, setCalledByStaff] = useState(false)
  const [delayNotice, setDelayNotice] = useState(false)
  const [displayMode, setDisplayMode] = useState<'timer' | 'queue'>('timer')
  const [turnsAhead, setTurnsAhead] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const alertPlayedRef = useRef(false)
  const queueAlertedRef = useRef<Set<number>>(new Set())
  const expiryTimeRef = useRef<number>(0)
  const prevEstimatedRef = useRef<number>(0)
  const displayModeRef = useRef<'timer' | 'queue'>('timer')
  const reachedZeroRef = useRef(false)

  const playBeeps = (count: number, freq: number, gain: number, duration: number, gap: number) => {
    try {
      const ctx = audioContextRef.current
      if (!ctx) return
      let time = ctx.currentTime
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.connect(g)
        g.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        g.gain.setValueAtTime(gain, time)
        g.gain.exponentialRampToValueAtTime(0.001, time + duration)
        osc.start(time)
        osc.stop(time + duration)
        time += gap
      }
    } catch {}
  }

  // Timer mode: 5 pitidos medios — tiempo llegó a cero
  const playAlert = () => {
    playBeeps(5, 880, 0.4, 0.4, 0.6)
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400, 200, 400, 200, 400])
  }

  // Cola: 3 pitidos suaves — queda 1 turno delante
  const playWarningAlert = () => {
    playBeeps(3, 660, 0.25, 0.3, 0.5)
    if (navigator.vibrate) navigator.vibrate([300, 200, 300, 200, 300])
  }

  // Cola: 8 pitidos fuertes — es su turno (0 delante)
  const playTurnAlert = () => {
    playBeeps(8, 880, 0.55, 0.4, 0.52)
    if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400, 150, 400, 150, 400, 150, 400, 150, 400, 150, 400])
  }

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/turno?token=${token}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        const remaining = data.remainingSeconds || 0
        prevEstimatedRef.current = data.estimated_wait_minutes
        if (remaining > 0 && !reachedZeroRef.current) alertPlayedRef.current = false

        const mode: 'timer' | 'queue' = data.displayMode || 'timer'
        displayModeRef.current = mode
        setDisplayMode(mode)
        setTurnsAhead(data.turnsAhead ?? 0)

        if (data.status === 'called') {
          setCalledByStaff(true)
          expiryTimeRef.current = 0
          setTimeLeft(0)
        } else if (!reachedZeroRef.current) {
          expiryTimeRef.current = Date.now() + remaining * 1000
          setTimeLeft(remaining)
        }

        setTurno(data)
        setOffline(false)
        localStorage.setItem(
          'turno_cache_' + token,
          JSON.stringify({ ...data, cachedAt: Date.now(), remainingSeconds: remaining })
        )
      }
    } catch {
      setOffline(true)
      const cached = localStorage.getItem('turno_cache_' + token)
      if (cached) {
        try {
          const data = JSON.parse(cached)
          const elapsed = Math.floor((Date.now() - data.cachedAt) / 1000)
          const remaining = Math.max(0, (data.remainingSeconds || 0) - elapsed)
          expiryTimeRef.current = Date.now() + remaining * 1000
          prevEstimatedRef.current = data.estimated_wait_minutes
          setTurno(data)
          setTimeLeft(remaining)
        } catch {
          setError('Sin conexión a internet.')
        }
      } else {
        setError('Sin conexión a internet.')
      }
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    if (!token) {
      setError('No se encontró el token.')
      setLoading(false)
      return
    }

    // Restaurar estado "llegó a cero" tras recarga de página
    if (localStorage.getItem(`turno_zero_${token}`)) {
      reachedZeroRef.current = true
      setTimeLeft(0)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    const handleOnline = () => { setOffline(false); fetchData() }
    const handleOffline = () => setOffline(true)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    fetchData()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [token, fetchData])

  // Suscripción en tiempo real: recibe actualizaciones del cajero instantáneamente
  useEffect(() => {
    if (!turno?.id || !token) return
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      return // sin variables de entorno (dev sin Supabase)
    }

    const channel = supabase
      .channel(`turn-${token}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'turns' },
        (payload: any) => {
          const updated = payload.new
          if (updated.token !== token) {
            // Turno ajeno: si estamos en modo cola, refrescar posición
            if (displayModeRef.current === 'queue') fetchData()
            return
          }

          const elapsed = (Date.now() - new Date(updated.created_at).getTime()) / 1000
          const naturalRemaining = Math.max(0, updated.estimated_wait_minutes * 60 - elapsed)
          const wasDecrease = prevEstimatedRef.current > 0 &&
            updated.estimated_wait_minutes < prevEstimatedRef.current
          const wasIncrease = prevEstimatedRef.current > 0 &&
            updated.estimated_wait_minutes > prevEstimatedRef.current

          if (updated.status === 'called') {
            // Cajero llamó el turno antes de que el tiempo llegara a cero
            setCalledByStaff(true)
            setDelayNotice(false)
            expiryTimeRef.current = 0
            setTimeLeft(0)
            if (!alertPlayedRef.current) {
              alertPlayedRef.current = true
              playAlert()
            }
            prevEstimatedRef.current = updated.estimated_wait_minutes
            setTurno((prev: any) => ({ ...prev, ...updated, remainingSeconds: 0 }))
          } else if (updated.status === 'waiting') {
            if (wasIncrease) setDelayNotice(true)
            prevEstimatedRef.current = updated.estimated_wait_minutes
            if (wasDecrease && !reachedZeroRef.current) {
              // Si el estimated bajó (recalcAfterRemoval), el cliente no puede
              // saber si está en slot 0 paralelo o slot 1+. Delegar al servidor
              // para que aplique el piso correcto según capacity.
              fetchData()
              return
            }
            if (!reachedZeroRef.current) {
              expiryTimeRef.current = Date.now() + naturalRemaining * 1000
              setTimeLeft(Math.ceil(naturalRemaining))
            }
            setTurno((prev: any) => ({ ...prev, ...updated, remainingSeconds: naturalRemaining }))
          } else {
            // completed/cancelled: no tocar el timer, debe quedar en cero
            prevEstimatedRef.current = updated.estimated_wait_minutes
            setTurno((prev: any) => ({ ...prev, ...updated }))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [turno?.id, token])

  // Temporizador basado en timestamp absoluto — sobrevive background/suspensión/throttle
  useEffect(() => {
    if (!turno) return
    const interval = setInterval(() => {
      if (expiryTimeRef.current === 0) return
      const left = Math.max(0, Math.ceil((expiryTimeRef.current - Date.now()) / 1000))
      if (left === 0) {
        reachedZeroRef.current = true
        if (token) localStorage.setItem(`turno_zero_${token}`, '1')
      }
      setTimeLeft(left)
    }, 500)
    return () => clearInterval(interval)
  }, [turno])

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

  useEffect(() => {
    if (displayMode !== 'timer') return
    if (timeLeft === 0 && audioActive && !alertPlayedRef.current) {
      alertPlayedRef.current = true
      playAlert()
    }
  }, [timeLeft, audioActive, displayMode])

  useEffect(() => {
    if (!audioActive || displayMode !== 'queue') return
    if (turnsAhead === 1 && !queueAlertedRef.current.has(1)) {
      queueAlertedRef.current.add(1)
      playWarningAlert()
    } else if (turnsAhead === 0 && !queueAlertedRef.current.has(0)) {
      queueAlertedRef.current.add(0)
      playTurnAlert()
    }
  }, [turnsAhead, audioActive, displayMode])

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
      <div style={{width:'100%',maxWidth:'400px'}}>
        {offline && (
          <div style={{background:'#854d0e',color:'white',padding:'0.5rem',textAlign:'center',borderRadius:'0.5rem',marginBottom:'1rem'}}>
            📵 Sin internet — reconéctate para mayor precisión
          </div>
        )}
        {delayNotice && (
          <div style={{background:'#44403c',color:'white',padding:'0.75rem 1rem',textAlign:'center',borderRadius:'0.5rem',marginBottom:'1rem',fontSize:'0.9rem',lineHeight:'1.4'}}>
            ⏳ Tu pedido tomará un poco más de lo previsto. ¡Gracias por tu paciencia!
          </div>
        )}
        <div style={{textAlign:'center',color:'white'}}>
          <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.8rem',marginBottom:'0.5rem'}}>NÚMERO DE TURNO</p>
          <h1 style={{fontSize:'5rem',fontWeight:'900',margin:'0',lineHeight:'1'}}>{turno.turn_number}</h1>
          <p style={{fontSize:'1.2rem',fontWeight:'600',margin:'1rem 0 0.5rem'}}>{turno.customer_name}</p>
          <p style={{fontSize:'0.9rem',color:'#94a3b8',margin:'0 0 2rem'}}>{statusMap[turno.status] || turno.status}</p>
          {displayMode === 'timer' ? (
            <>
              <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.7rem',marginBottom:'0.5rem'}}>TIEMPO ESTIMADO</p>
              <h2 style={{fontSize:'4rem',fontWeight:'900',color: timeLeft === 0 ? '#fbbf24' : '#4ade80',margin:'0'}}>{mins}:{secs}</h2>
              {!audioActive && (
                <button
                  onClick={handleActivateAudio}
                  style={{marginTop:'2rem',padding:'0.75rem 1.5rem',background:'#3b82f6',color:'white',border:'none',borderRadius:'0.5rem',fontSize:'1rem',fontWeight:'600',cursor:'pointer',transition:'background 0.3s'}}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
                >
                  🔔 Activar alerta sonora
                </button>
              )}
            </>
          ) : (
            <>
              {turnsAhead === 0 ? (
                <div style={{padding:'1.5rem',background:'#064e3b',borderRadius:'1rem',color:'white',border:'2px solid #10b981',marginBottom:'0.5rem'}}>
                  <p style={{fontSize:'2.2rem',fontWeight:'900',margin:'0 0 0.4rem 0'}}>¡ES TU TURNO!</p>
                  <p style={{fontSize:'0.95rem',margin:'0',color:'#6ee7b7'}}>Acércate al mostrador a retirar tu pedido</p>
                </div>
              ) : (
                <>
                  <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.75rem',marginBottom:'0.75rem'}}>TURNO(S) DELANTE</p>
                  <p style={{
                    fontSize:'4.5rem',
                    fontWeight:'900',
                    color: turnsAhead === 1 ? '#fbbf24' : '#4ade80',
                    margin:'0 0 0.25rem 0',
                    lineHeight:'1'
                  }}>{turnsAhead}</p>
                  {turnsAhead === 1 && (
                    <div style={{marginTop:'1.25rem',padding:'1rem 1.5rem',background:'#451a03',borderRadius:'1rem',border:'1px solid #f59e0b'}}>
                      <p style={{fontSize:'1rem',fontWeight:'600',margin:'0',color:'#fcd34d'}}>
                        Vaya acercándose, usted será el próximo
                      </p>
                    </div>
                  )}
                </>
              )}
              {!audioActive && (
                <button
                  onClick={handleActivateAudio}
                  style={{marginTop:'2rem',padding:'0.75rem 1.5rem',background:'#3b82f6',color:'white',border:'none',borderRadius:'0.5rem',fontSize:'1rem',fontWeight:'600',cursor:'pointer',transition:'background 0.3s'}}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
                >
                  🔔 Activar alerta sonora
                </button>
              )}
            </>
          )}
          {calledByStaff && (
            <div style={{marginTop:'2rem',padding:'1.5rem',background:'#1e3a5f',borderRadius:'1rem',color:'white',border:'2px solid #3b82f6'}}>
              <p style={{fontSize:'1.8rem',fontWeight:'900',margin:'0 0 0.5rem 0'}}>¡TE ESTÁN LLAMANDO!</p>
              <p style={{fontSize:'0.9rem',margin:'0',color:'#93c5fd'}}>El cajero te llama — acércate al mostrador</p>
            </div>
          )}
          {!calledByStaff && displayMode === 'timer' && timeLeft === 0 && turno && (
            <div style={{marginTop:'2rem',padding:'1.5rem',background:'#064e3b',borderRadius:'1rem',color:'white',border:'2px solid #10b981'}}>
              <p style={{fontSize:'1.8rem',fontWeight:'900',margin:'0 0 0.5rem 0'}}>¡ORDEN LISTA!</p>
              <p style={{fontSize:'0.9rem',margin:'0',color:'#d1d5db'}}>Acércate a retirar tu pedido</p>
            </div>
          )}
        <p style={{marginTop:'1.5rem',textAlign:'center',color:'#475569',fontSize:'0.7rem',fontFamily:'monospace'}}>{APP_VERSION}</p>
        </div>
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
