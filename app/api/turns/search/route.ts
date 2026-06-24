import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''

// Busca el turno activo (waiting/called) más reciente del negocio por whatsapp o por pin.
// Devuelve { turn: <turno> | null }.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const whatsapp = searchParams.get('whatsapp')
  const pin = searchParams.get('pin')

  if (!whatsapp && !pin) {
    return NextResponse.json({ error: 'whatsapp o pin requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  let query = supabase
    .from('turns')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .in('status', ['waiting', 'called'])
    .order('created_at', { ascending: false })
    .limit(1)

  query = whatsapp ? query.eq('whatsapp', whatsapp) : query.eq('pin', pin)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const turn = Array.isArray(data) && data.length > 0 ? data[0] : null
  return NextResponse.json({ turn })
}
