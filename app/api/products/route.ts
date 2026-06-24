import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || ''

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, estimated_minutes')
    .eq('business_id', BUSINESS_ID)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { name, estimated_minutes } = await request.json()
  if (!name || !estimated_minutes) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .insert([{ name, estimated_minutes, business_id: BUSINESS_ID }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { id, name, estimated_minutes } = await request.json()
  if (!id || !name || !estimated_minutes) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .update({ name, estimated_minutes })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
