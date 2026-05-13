'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id'
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id'

export default function RegistroPage() {
  const router = useRouter()
  const [searchMode, setSearchMode] = useState<'whatsapp' | 'pin'>('whatsapp')
  const [whatsapp, setWhatsapp] = useState('')
  const [pin, setPin] = useState('')
  const [isWhatsappPrefilled, setIsWhatsappPrefilled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const savedWhatsapp = localStorage.getItem('whatsapp_cliente')
    if (savedWhatsapp) {
      setWhatsapp(savedWhatsapp)
      setIsWhatsappPrefilled(true)
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (searchMode === 'whatsapp') {
      if (!whatsapp.trim()) {
        setError('Ingresa tu WhatsApp para continuar.')
        return
      }
    } else {
      if (!/^[0-9]{4}$/.test(pin.trim())) {
        setError('Ingresa un PIN válido de 4 dígitos.')
        return
      }
    }

    setError('')
    setMessage('')
    setLoading(true)

    const supabase = createClient()

    const query = supabase
      .from('turns')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: false })
      .limit(1)

    const queryWithFilter =
      searchMode === 'whatsapp'
        ? query.eq('whatsapp', whatsapp.trim())
        : query.eq('pin', pin.trim())

    const { data, error: queryError } = await queryWithFilter

    if (queryError) {
      console.error(queryError)
      setError('Error al buscar tu turno. Intenta de nuevo.')
      setLoading(false)
      return
    }

    const existingTurn = data && Array.isArray(data) && data.length > 0 ? data[0] : null

    if (existingTurn && existingTurn.token) {
      if (searchMode === 'whatsapp') {
        localStorage.setItem('whatsapp_cliente', whatsapp.trim())
      }
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
        <p className="mt-3 text-slate-400">Busca tu turno activo por WhatsApp o por PIN.</p>

        <div className="mt-6 flex gap-2 rounded-full bg-slate-800/60 p-1 text-sm">
          <button
            type="button"
            onClick={() => setSearchMode('whatsapp')}
            className={`rounded-full px-4 py-2 transition ${searchMode === 'whatsapp' ? 'bg-slate-50 text-slate-950' : 'text-slate-200 hover:text-white'}`}
          >
            Buscar por WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('pin')}
            className={`rounded-full px-4 py-2 transition ${searchMode === 'pin' ? 'bg-slate-50 text-slate-950' : 'text-slate-200 hover:text-white'}`}
          >
            Buscar por PIN
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {searchMode === 'whatsapp' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">WhatsApp</label>
              <input
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-500"
                placeholder="Ej. +5491123456789"
                required
              />
              {isWhatsappPrefilled && (
                <p className="mt-2 text-xs text-slate-400">Número recordado de tu visita anterior</p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">PIN</label>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, ''))}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={4}
                className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-500"
                placeholder="Ej. 4521"
                required
              />
            </div>
          )}

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
