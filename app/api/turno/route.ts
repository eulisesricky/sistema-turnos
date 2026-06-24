import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const supabase = createAdminClient()

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

  const { count: turnsAheadCount } = await supabase
    .from('turns')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', data.business_id)
    .in('status', ['waiting', 'called'])
    .lt('created_at', data.created_at)

  const turnsAhead = turnsAheadCount ?? 0

  const { data: settings } = await supabase
    .from('settings')
    .select('display_mode, parallel_capacity')
    .eq('business_id', data.business_id)
    .maybeSingle()

  const displayMode = (settings?.display_mode as 'timer' | 'queue' | 'both') ?? 'timer'
  const capacity = settings?.parallel_capacity ?? 2

  const turnSlot = Math.floor(turnsAhead / capacity)
  const prepSeconds = (data.prep_minutes || 0) * 60
  let remainingSeconds = naturalRemaining

  if (prepSeconds > 0 && data.status === 'waiting' && turnSlot > 0) {
    remainingSeconds = Math.max(prepSeconds, naturalRemaining)
  }

  return NextResponse.json({ ...data, remainingSeconds, turnsAhead, displayMode })
}
