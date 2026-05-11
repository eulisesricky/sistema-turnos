'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

function TurnoContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [turno, setTurno] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      }
      setLoading(false)
    }

    fetchTurno()

    const channel = supabase
      .channel('turno-' + token)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `token=eq.${token}` },
        (payload) => { setTurno(payload.new) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [token])

  if (loading) return <div style={{textAlign:'center',padding:'2rem'}}>Cargando tu turno...</div>
  if (error) return <div style={{textAlign:'center',padding:'2rem',color:'red'}}>{error}</div>

  return (
    <div style={{maxWidth:'400px',margin:'2rem auto',padding:'2rem',textAlign:'center'}}>
      <h1>TU TURNO</h1>
      <h2 style={{fontSize:'4rem'}}>{turno.turn_number}</h2>
      <p>Nombre: {turno.customer_name}</p>
      <p>Estado: {turno.status}</p>
      <p>Tiempo estimado: {turno.estimated_wait_minutes} min</p>
    </div>
  )
}

export default function TurnoPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <TurnoContent />
    </Suspense>
  )
}
