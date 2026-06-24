'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
  const [displayMode, setDisplayMode] = useState<'timer' | 'queue' | 'both'>('timer')
  const [turnsAhead, setTurnsAhead] = useState(0)

  const audioContextRef  = useRef<AudioContext | null>(null)
  const alertPlayedRef   = useRef(false)
  const queueAlertedRef  = useRef<Set<number>>(new Set())
  const expiryTimeRef    = useRef<number>(0)
  const prevEstimatedRef = useRef<number>(0)
  const displayModeRef   = useRef<'timer' | 'queue' | 'both'>('timer')
  const reachedZeroRef   = useRef(false)
  // Wake Lock: evita que la pantalla se apague por inactividad
  const wakeLockRef      = useRef<any>(null)
  // Rastrea qué notificaciones ya se enviaron (no repetir)
  const notifSentRef     = useRef<Set<string>>(new Set())

  // ── Audio (Web Audio API) ──────────────────────────────────────────────────
  const playBeeps = (count: number, freq: number, gain: number, duration: number, gap: number) => {
    try {
      const ctx = audioContextRef.current
      if (!ctx) return
      let time = ctx.currentTime
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator()
        const g   = ctx.createGain()
        osc.connect(g); g.connect(ctx.destination)
        osc.frequency.value = freq; osc.type = 'sine'
        g.gain.setValueAtTime(gain, time)
        g.gain.exponentialRampToValueAtTime(0.001, time + duration)
        osc.start(time); osc.stop(time + duration)
        time += gap
      }
    } catch {}
  }

  const playAlert        = () => { playBeeps(5, 880, 0.4,  0.4, 0.6);  if (navigator.vibrate) navigator.vibrate([400,200,400,200,400,200,400,200,400]) }
  const playWarningAlert = () => { playBeeps(3, 660, 0.25, 0.3, 0.5);  if (navigator.vibrate) navigator.vibrate([300,200,300,200,300]) }
  const playTurnAlert    = () => { playBeeps(8, 880, 0.55, 0.4, 0.52); if (navigator.vibrate) navigator.vibrate([400,150,400,150,400,150,400,150,400,150,400,150,400,150,400]) }

  // ── Notificación nativa vía Service Worker ─────────────────────────────────
  // La notificación del SO suena y vibra aunque la pantalla esté bloqueada
  // porque pasa por el canal de notificaciones del sistema operativo,
  // no por el Web Audio API que se suspende en background.
  const sendNotification = async (title: string, body: string, tag: string) => {
    if (notifSentRef.current.has(tag)) return
    notifSentRef.current.add(tag)
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification(title, {
          body,
          icon: '/icon.png',
          requireInteraction: true,
          tag,
          renotify: true,
        } as any)
        return
      }
    } catch {}
    try { new Notification(title, { body, icon: '/icon.png', tag }) } catch {}
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const res  = await fetch(`/api/turno?token=${token}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        const remaining = data.remainingSeconds || 0
        // Detectar aumento del estimado (demora) antes de sobrescribir la referencia
        const prevEstimated = prevEstimatedRef.current
        const wasIncrease = prevEstimated > 0 && data.estimated_wait_minutes > prevEstimated
        prevEstimatedRef.current = data.estimated_wait_minutes
        if (remaining > 0 && !reachedZeroRef.current) alertPlayedRef.current = false

        const mode: 'timer' | 'queue' | 'both' = data.displayMode || 'timer'
        displayModeRef.current = mode
        setDisplayMode(mode)
        setTurnsAhead(data.turnsAhead ?? 0)

        const lockZero = () => {
          reachedZeroRef.current = true
          if (token) localStorage.setItem(`turno_zero_${token}`, '1')
          expiryTimeRef.current = 0
          setTimeLeft(0)
        }
        if (data.status === 'called') {
          setCalledByStaff(true)
          setDelayNotice(false)
          lockZero()
          // Alerta de "te están llamando" (antes estaba en el canal realtime)
          if (!alertPlayedRef.current) {
            alertPlayedRef.current = true
            playAlert()
            sendNotification(
              '📣 ¡Te están llamando!',
              'El cajero te espera — acércate al mostrador.',
              'staff-call'
            )
          }
        } else if (data.status === 'completed' || data.status === 'cancelled') {
          lockZero()
        } else if (!reachedZeroRef.current) {
          if (wasIncrease) setDelayNotice(true)
          expiryTimeRef.current = Date.now() + remaining * 1000
          setTimeLeft(remaining)
        }

        setTurno(data)
        setOffline(false)
        localStorage.setItem('turno_cache_' + token,
          JSON.stringify({ ...data, cachedAt: Date.now(), remainingSeconds: remaining }))
      }
    } catch {
      setOffline(true)
      const cached = localStorage.getItem('turno_cache_' + token)
      if (cached) {
        try {
          const data      = JSON.parse(cached)
          const elapsed   = Math.floor((Date.now() - data.cachedAt) / 1000)
          const remaining = Math.max(0, (data.remainingSeconds || 0) - elapsed)
          prevEstimatedRef.current = data.estimated_wait_minutes
          setTurno(data)
          if (!reachedZeroRef.current) {
            expiryTimeRef.current = Date.now() + remaining * 1000
            setTimeLeft(remaining)
          }
        } catch { setError('Sin conexión a internet.') }
      } else {
        setError('Sin conexión a internet.')
      }
    }
    setLoading(false)
  }, [token])

  // ── Registrar Service Worker al montar ─────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // ── Init: eventos, fetch, restaurar estado "ya llegó a cero" ───────────────
  useEffect(() => {
    if (!token) { setError('No se encontró el token.'); setLoading(false); return }

    if (localStorage.getItem(`turno_zero_${token}`)) {
      reachedZeroRef.current = true
      setTimeLeft(0)
    }

    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') fetchData() }
    const handleOnline  = () => { setOffline(false); fetchData() }
    const handleOffline = () => setOffline(true)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    fetchData()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [token, fetchData])

  // ── Sondeo periódico: reemplazo del canal realtime de Supabase ─────────────
  // Cada 5 s se vuelve a consultar /api/turno; fetchData ya dispara las alertas
  // de "te están llamando" y de demora, y actualiza tiempo/cola.
  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => { fetchData() }, 5000)
    return () => clearInterval(interval)
  }, [token, fetchData])

  // ── Temporizador basado en timestamp absoluto ───────────────────────────────
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

  // ── Activar audio + pedir permiso de notificaciones ────────────────────────
  const handleActivateAudio = async () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = ctx
      setAudioActive(true)
      alertPlayedRef.current = false
      // Pide permiso para notificaciones nativas del SO
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    } catch {}
  }

  // ── Wake Lock: evita auto-bloqueo por inactividad ──────────────────────────
  // Re-adquiere cada vez que la pestaña vuelve al frente (el SO la libera al ir al fondo)
  useEffect(() => {
    if (!audioActive) return
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return
      try {
        if (!wakeLockRef.current || wakeLockRef.current.released) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
        }
      } catch {}
    }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      wakeLockRef.current?.release?.().catch?.(() => {})
      wakeLockRef.current = null
    }
  }, [audioActive])

  // ── Alerta timer (tiempo llegó a cero) ────────────────────────────────────
  useEffect(() => {
    if (displayMode !== 'timer' && displayMode !== 'both') return
    if (timeLeft === 0 && audioActive && !alertPlayedRef.current) {
      alertPlayedRef.current = true
      playAlert()
      sendNotification(
        '✅ ¡Tu pedido está listo!',
        'Acércate al mostrador a retirarlo.',
        'timer-zero'
      )
    }
  }, [timeLeft, audioActive, displayMode])

  // ── Alerta cola (posición) ────────────────────────────────────────────────
  useEffect(() => {
    if (!audioActive || (displayMode !== 'queue' && displayMode !== 'both')) return
    if (turnsAhead === 1 && !queueAlertedRef.current.has(1)) {
      queueAlertedRef.current.add(1)
      playWarningAlert()
      sendNotification(
        '🔔 Prepárate',
        '¡Solo 1 turno antes que el tuyo! Vaya acercándose.',
        'queue-1'
      )
    } else if (turnsAhead === 0 && !queueAlertedRef.current.has(0)) {
      queueAlertedRef.current.add(0)
      playTurnAlert()
      sendNotification(
        '🎉 ¡Es tu turno!',
        'Acércate al mostrador a retirar tu pedido.',
        'queue-0'
      )
    }
  }, [turnsAhead, audioActive, displayMode])

  // ── Render ─────────────────────────────────────────────────────────────────
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(Math.floor(timeLeft % 60)).padStart(2, '0')

  if (loading) return <div style={{color:'white',textAlign:'center',padding:'2rem'}}>Cargando...</div>
  if (error)   return <div style={{color:'white',textAlign:'center',padding:'2rem'}}>{error}</div>

  const statusMap: Record<string,string> = {
    waiting:   'En espera',
    called:    '¡Tu turno está listo!',
    completed: 'Completado',
    cancelled: 'Cancelado',
  }

  const btnActivar = (
    <button
      onClick={handleActivateAudio}
      style={{marginTop:'2rem',padding:'0.75rem 1.5rem',background:'#3b82f6',color:'white',border:'none',borderRadius:'0.5rem',fontSize:'1rem',fontWeight:'600',cursor:'pointer',transition:'background 0.3s'}}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
    >
      🔔 Activar alertas y notificaciones
    </button>
  )

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
              {!audioActive && btnActivar}
            </>
          ) : displayMode === 'both' ? (
            <>
              {turnsAhead === 0 ? (
                <div style={{padding:'1.25rem',background:'#064e3b',borderRadius:'1rem',color:'white',border:'2px solid #10b981',marginBottom:'1.5rem'}}>
                  <p style={{fontSize:'2rem',fontWeight:'900',margin:'0 0 0.3rem 0'}}>¡ES TU TURNO!</p>
                  <p style={{fontSize:'0.9rem',margin:'0',color:'#6ee7b7'}}>Acércate al mostrador a retirar tu pedido</p>
                </div>
              ) : (
                <div style={{marginBottom:'1.5rem'}}>
                  <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.75rem',marginBottom:'0.5rem'}}>TURNO(S) DELANTE</p>
                  <p style={{fontSize:'4rem',fontWeight:'900',color: turnsAhead === 1 ? '#fbbf24' : '#4ade80',margin:'0',lineHeight:'1'}}>{turnsAhead}</p>
                  {turnsAhead === 1 && (
                    <div style={{marginTop:'1rem',padding:'0.75rem 1.25rem',background:'#451a03',borderRadius:'1rem',border:'1px solid #f59e0b'}}>
                      <p style={{fontSize:'0.95rem',fontWeight:'600',margin:'0',color:'#fcd34d'}}>Vaya acercándose, usted será el próximo</p>
                    </div>
                  )}
                </div>
              )}
              <div style={{borderTop:'1px solid #1e293b',paddingTop:'1.25rem'}}>
                <p style={{color:'#4ade80',letterSpacing:'0.2em',fontSize:'0.7rem',marginBottom:'0.5rem'}}>TIEMPO ESTIMADO</p>
                <h2 style={{fontSize:'3.5rem',fontWeight:'900',color: timeLeft === 0 ? '#fbbf24' : '#4ade80',margin:'0'}}>{mins}:{secs}</h2>
              </div>
              {!audioActive && btnActivar}
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
                  <p style={{fontSize:'4.5rem',fontWeight:'900',color: turnsAhead === 1 ? '#fbbf24' : '#4ade80',margin:'0 0 0.25rem 0',lineHeight:'1'}}>{turnsAhead}</p>
                  {turnsAhead === 1 && (
                    <div style={{marginTop:'1.25rem',padding:'1rem 1.5rem',background:'#451a03',borderRadius:'1rem',border:'1px solid #f59e0b'}}>
                      <p style={{fontSize:'1rem',fontWeight:'600',margin:'0',color:'#fcd34d'}}>
                        Vaya acercándose, usted será el próximo
                      </p>
                    </div>
                  )}
                </>
              )}
              {!audioActive && btnActivar}
            </>
          )}

          {calledByStaff && (
            <div style={{marginTop:'2rem',padding:'1.5rem',background:'#1e3a5f',borderRadius:'1rem',color:'white',border:'2px solid #3b82f6'}}>
              <p style={{fontSize:'1.8rem',fontWeight:'900',margin:'0 0 0.5rem 0'}}>¡TE ESTÁN LLAMANDO!</p>
              <p style={{fontSize:'0.9rem',margin:'0',color:'#93c5fd'}}>El cajero te llama — acércate al mostrador</p>
            </div>
          )}
          {!calledByStaff && (displayMode === 'timer' || displayMode === 'both') && timeLeft === 0 && turno && (
            <div style={{marginTop:'2rem',padding:'1.5rem',background:'#064e3b',borderRadius:'1rem',color:'white',border:'2px solid #10b981'}}>
              <p style={{fontSize:'1.8rem',fontWeight:'900',margin:'0 0 0.5rem 0'}}>¡ORDEN LISTA!</p>
              <p style={{fontSize:'0.9rem',margin:'0',color:'#d1d5db'}}>Acércate a retirar tu pedido</p>
            </div>
          )}

          {audioActive && (
            <p style={{marginTop:'1rem',color:'#4ade80',fontSize:'0.75rem'}}>
              🔔 Alertas activas — mantén el navegador abierto
            </p>
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
