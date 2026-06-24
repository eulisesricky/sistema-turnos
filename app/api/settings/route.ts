import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('settings')
    .select('parallel_capacity, buffer_percentage, display_mode')
    .eq('business_id', BUSINESS_ID)
    .limit(1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('settings')
    .upsert({ business_id: BUSINESS_ID, ...body }, { onConflict: 'business_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
