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
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.connect(gain)
    gain.connect(audioContext.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start()
    setTimeout(() => {
      osc.stop()
      audioContext.close()
    }, 1000)
  } catch (error) {
    console.warn('Audio no disponible', error)
  }
}

const vibrateAlert = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([500, 200, 500, 200, 500])
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function calculateRemainingSecondsFromTurno(turno: any) {
  if (!turno) return 0
  const createdAt = new Date(turno.created_at).getTime()
  const elapsedMinutes = (Date.now() - createdAt) / 60000
  const remainingMinutes = Math.max(0, (turno.estimated_wait_minutes || 0) - elapsedMinutes)
  return Math.max(0, Math.round(remainingMinutes * 60))
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
        setRemainingSeconds(calculateRemainingSecondsFromTurno(data))
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
            setRemainingSeconds(calculateRemainingSecondsFromTurno(updatedTurno))
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
  const isCalled = turno.status === 'called'

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white"> <div className="text-center p-8">Cargando tu turno...</div> </div>
  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white"> <div className="text-center p-8 text-red-400">{error}</div> </div>

  const isReady = isCalled || remainingSeconds === 0

  return (
    <div className={`min-h-screen w-full bg-gradient-to-b ${isReady ? 'from-emerald-900 via-emerald-700 to-emerald-500' : 'from-slate-950 via-slate-900 to-slate-800'} text-white flex flex-col justify-center px-6 py-10`}>
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300 mb-4">NÚMERO DE TURNO</p>
          <p className="text-8xl font-black tracking-[0.15em] text-white sm:text-9xl">{turno.turn_number}</p>
        </div>

        <div className="mb-6">
          <p className={`text-2xl font-semibold ${isReady ? 'text-[#003320]' : 'text-white'}`}>{turno.customer_name}</p>
        </div>

        <div className="mb-6">
          <p className={`text-lg ${isReady ? 'text-[#003320]' : 'text-slate-300'}`}>{statusLabel}</p>
        </div>

        <div className="mb-6">
          <p className="text-6xl font-black tracking-[0.15em] text-[#003320]">{countdown}</p>
        </div>

        {isCalled && (
          <div className="mt-8 rounded-[2rem] border border-orange-400 bg-orange-500/10 p-6 text-center text-2xl font-bold uppercase tracking-[0.25em] text-orange-100">
            ¡ES TU TURNO!
          </div>
        )}

        <div className={`mt-8 text-center text-sm ${isReady ? 'text-[#003320]' : 'text-slate-400'}`}>
          <p>La información se actualiza en tiempo real.</p>
          <p className="mt-2">Si tu turno fue llamado, recibirás alerta sonora y vibración.</p>
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
