import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const supabase = createAdminClient()
  let query = supabase
    .from('turns')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', BUSINESS_ID)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lt('created_at', to)
  const { count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count })
}
