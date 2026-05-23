import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('turns')
    .select('*')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })

  const createdAt = new Date(data.created_at).getTime()
  const now = Date.now()
  const elapsedSeconds = (now - createdAt) / 1000
  const totalSeconds = (data.estimated_wait_minutes || 0) * 60
  const naturalRemaining = Math.max(0, totalSeconds - elapsedSeconds)

  // Contar turnos delante (se usa tanto para el piso como para el modo cola)
  const { count: turnsAheadCount } = await supabase
    .from('turns')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', data.business_id)
    .in('status', ['waiting', 'called'])
    .lt('created_at', data.created_at)

  const turnsAhead = turnsAheadCount ?? 0

  // Leer configuración del negocio (display_mode + parallel_capacity)
  const { data: settings } = await supabase
    .from('settings')
    .select('display_mode, parallel_capacity')
    .eq('business_id', data.business_id)
    .maybeSingle()

  const displayMode = (settings?.display_mode as 'timer' | 'queue') ?? 'timer'
  const capacity = settings?.parallel_capacity ?? 2

  // Piso: solo aplicar si el turno está en un slot posterior al primero.
  // Con capacity>1, turnos paralelos en slot 0 cuentan regresivamente (su prep ya empezó);
  // solo turnos en slot 1+ están realmente esperando.
  const turnSlot = Math.floor(turnsAhead / capacity)
  const prepSeconds = (data.prep_minutes || 0) * 60
  let remainingSeconds = naturalRemaining
  if (prepSeconds > 0 && data.status === 'waiting' && turnSlot > 0) {
    remainingSeconds = Math.max(prepSeconds, naturalRemaining)
  }

  return NextResponse.json({ ...data, remainingSeconds, turnsAhead, displayMode })
}
