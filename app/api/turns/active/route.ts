import { createAdminClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('turns')
    .select('estimated_wait_minutes')
    .eq('business_id', BUSINESS_ID)
    .in('status', ['waiting', 'called'])
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
