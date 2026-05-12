'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id'
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id'

export default function RegistroPage() {
  const router = useRouter()
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!whatsapp.trim()) {
      setError('Ingresa tu WhatsApp para continuar.')
      return
    }

    setError('')
    setMessage('')
    setLoading(true)

    const supabase = createClient()

    const { data, error: queryError } = await supabase
      .from('turns')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('whatsapp', whatsapp.trim())
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (queryError) {
      console.error(queryError)
      setError('Error al buscar tu turno. Intenta de nuevo.')
      setLoading(false)
      return
    }

    const existingTurn = data && typeof data === 'object' ? data : null

    if (existingTurn && existingTurn.token) {
      router.push(`/turno?token=${existingTurn.token}`)
      return
    }

    setMessage('No tienes un turno activo. Solicita tu turno en caja.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/95 p-8 shadow-2xl shadow-black/40">
        <h1 className="text-3xl font-black">Registrá tu turno</h1>
        <p className="mt-3 text-slate-400">Ingresa tu WhatsApp para buscar tu turno activo.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-500"
              placeholder="Ej. +5491123456789"
              required
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {message && <p className="text-sm text-emerald-300">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-3xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? 'Buscando...' : 'Buscar turno'}
          </button>
        </form>
      </div>
    </div>
  )
}
