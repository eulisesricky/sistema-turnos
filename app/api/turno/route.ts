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
  return NextResponse.json(data)
}
