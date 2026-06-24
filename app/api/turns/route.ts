import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''
const QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || ''

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('turns')
    .select('id, customer_name, whatsapp, pin, turn_number, status, created_at, estimated_wait_minutes, prep_minutes')
    .eq('business_id', BUSINESS_ID)
    .in('status', ['waiting', 'called'])
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('turns')
    .insert([{ ...body, status: 'waiting', queue_id: QUEUE_ID, business_id: BUSINESS_ID }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('turns')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
