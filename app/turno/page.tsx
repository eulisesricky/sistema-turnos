'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const statusLabels: Record<string, string> = {
  waiting: 'En espera',
  called: '¡Tu turno está listo!',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const playAlertTone = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 440
    gain.gain.value = 0.14
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.4)
    oscillator.onended = () => audioContext.close()
  } catch (error) {
    console.warn('Audio no disponible', error)
  }
}

const vibrateAlert = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([500, 200, 500])
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function TurnoContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [turno, setTurno] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [hasAlerted, setHasAlerted] = useState(false)
  const [statusAlerted, setStatusAlerted] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('No se encontró el token en la URL.')
      setLoading(false)
      return
    }

    const supabase = createClient()

    const fetchTurno = async () => {
      const { data, error } = await supabase
        .from('turns')
        .select('*')
        .eq('token', token)
        .single()

      if (error || !data) {
        setError('Turno no encontrado.')
      } else {
        setTurno(data)
        setRemainingSeconds(Math.max(0, Math.round((data.estimated_wait_minutes || 0) * 60)))
        setHasAlerted(false)
        setStatusAlerted(false)
      }
      setLoading(false)
    }

    fetchTurno()

    const channel = supabase
      .channel('turno-' + token)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `token=eq.${token}` },
        (payload) => {
          if (payload.new) {
            const updatedTurno = payload.new as any
            setTurno(updatedTurno)
            setRemainingSeconds(Math.max(0, Math.round((updatedTurno.estimated_wait_minutes || 0) * 60)))
            setHasAlerted(false)
            setStatusAlerted(false)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [token])

  useEffect(() => {
    if (!turno) return
    if (turno.status === 'called' && !statusAlerted) {
      playAlertTone()
      vibrateAlert()
      setStatusAlerted(true)
      setHasAlerted(true)
    }
  }, [turno, statusAlerted])

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setInterval(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [remainingSeconds])

  useEffect(() => {
    if (remainingSeconds === 0 && turno && !hasAlerted) {
      playAlertTone()
      vibrateAlert()
      setHasAlerted(true)
    }
  }, [remainingSeconds, turno, hasAlerted])

  const statusLabel = turno ? statusLabels[turno.status] ?? 'Desconocido' : ''
  const countdown = useMemo(() => formatTime(remainingSeconds), [remainingSeconds])

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white"> <div className="text-center p-8">Cargando tu turno...</div> </div>
  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white"> <div className="text-center p-8 text-red-400">{error}</div> </div>

  const isCalled = turno.status === 'called'
  const isExpired = remainingSeconds === 0 && turno.status !== 'called'

  return (
    <div className={`min-h-screen w-full bg-gradient-to-b ${isCalled ? 'from-orange-950 via-orange-700 to-orange-600' : isExpired ? 'from-emerald-900 via-emerald-700 to-emerald-500' : 'from-slate-950 via-slate-900 to-slate-800'} text-white`}>
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/95 p-8 shadow-2xl shadow-black/60">
          <div className="mb-6 text-center">
            <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">Tu turno</p>
            <h1 className="mt-4 text-5xl font-black tracking-tight sm:text-6xl">{turno.customer_name}</h1>
            <p className="mt-2 text-base uppercase tracking-[0.35em] text-slate-400">Código</p>
            <p className="mt-3 text-7xl font-black tracking-[0.15em] text-white sm:text-8xl">{turno.turn_number}</p>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-black/30 p-6 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-300">Estado</p>
              <p className={`mt-3 text-4xl font-black ${isCalled ? 'text-orange-200' : 'text-white'}`}>{statusLabel}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5 text-center">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Tiempo estimado</p>
                <p className="mt-3 text-3xl font-semibold text-white">{turno.estimated_wait_minutes} min</p>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5 text-center">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Cuenta regresiva</p>
                <p className="mt-3 text-5xl font-black text-emerald-300">{countdown}</p>
              </div>
            </div>

            {isCalled && (
              <div className="rounded-[2rem] border border-orange-400 bg-orange-500/10 p-6 text-center text-xl font-bold uppercase tracking-[0.25em] text-orange-100">
                ¡ES TU TURNO!
              </div>
            )}

            <div className="rounded-[2rem] border border-white/10 bg-black/30 p-6 text-center text-sm text-slate-300">
              <p>La información se actualiza en tiempo real.</p>
              <p className="mt-2">Si tu turno fue llamado, recibirás alerta sonora y vibración.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TurnoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Cargando...</div>}>
      <TurnoContent />
    </Suspense>
  )
}
