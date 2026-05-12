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
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
  
  return NextResponse.json({ ...data, remainingSeconds })
}
