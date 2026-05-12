'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id'
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id'

export default function RegistroPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Ingresa tu nombre para continuar.')
      return
    }

    setError('')
    setLoading(true)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const supabase = createClient()

    const { count, error: countError } = await supabase
      .from('turns')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())

    if (countError) {
      console.error(countError.message)
      setError('Error al calcular el número de turno.')
      setLoading(false)
      return
    }

    const sequence = (count ?? 0) + 1
    const turnNumber = `RG${String(sequence).padStart(3, '0')}`
    const token = Math.random().toString(36).slice(2, 12)

    const { error: insertError } = await supabase.from('turns').insert([
      {
        customer_name: name,
        whatsapp,
        turn_number: turnNumber,
        status: 'waiting',
        estimated_wait_minutes: 0,
        token,
        queue_id: DEFAULT_QUEUE_ID,
        business_id: DEFAULT_BUSINESS_ID,
      },
    ])

    if (insertError) {
      console.error(insertError.message)
      setError('No se pudo registrar el turno. Intenta de nuevo.')
      setLoading(false)
      return
    }

    router.push(`/turno?token=${token}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/95 p-8 shadow-2xl shadow-black/40">
        <h1 className="text-3xl font-black">Registrá tu turno</h1>
        <p className="mt-3 text-slate-400">Ingresa tu nombre para crear el turno y acceder al estado en tiempo real.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Nombre</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-500"
              placeholder="Ej. Juan Pérez"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-500"
              placeholder="Ej. +5491123456789"
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-3xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? 'Registrando...' : 'Crear turno'}
          </button>
        </form>
      </div>
    </div>
  )
}
