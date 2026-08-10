import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Map Paystack plan codes to ForgeFlow plan keys. Add your codes here after
// creating plans in the Paystack dashboard.
const PLAN_BY_PAYSTACK_CODE: Record<string, string> = {}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!secretKey) {
      console.error('PAYSTACK_SECRET_KEY not configured')
      return new Response('ok', { headers: corsHeaders, status: 200 })
    }

    const rawBody = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    if (!signature || !(await verifySignature(rawBody, signature, secretKey))) {
      return new Response('Invalid signature', { status: 401 })
    }

    const event = JSON.parse(rawBody)
    if (event.event !== 'charge.success') {
      return new Response('ok', { headers: corsHeaders, status: 200 })
    }

    const tx = event.data
    if (!tx?.reference || tx.status !== 'success') {
      return new Response('ok', { headers: corsHeaders, status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const email = tx.customer?.email || ''
    const plan = mapPlan(tx.plan?.plan_code, tx.metadata)
    const billing = tx.metadata?.billing || 'monthly'
    const usdCents = Number(tx.metadata?.usd_cents) || 0

    if (plan) {
      await upsertPayment(supabase, tx, email, plan, billing, usdCents)
      await upsertSubscription(supabase, email, plan, billing, tx, usdCents)
    } else {
      await logWebhook(supabase, event)
    }

    return new Response('ok', { headers: corsHeaders, status: 200 })
  } catch (error) {
    console.error('paystack-webhook error:', error)
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }
})

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return signature === hex
}

function mapPlan(planCode: string | null | undefined, metadata: Record<string, unknown>): string | null {
  if (metadata?.plan && typeof metadata.plan === 'string') return metadata.plan
  if (planCode && PLAN_BY_PAYSTACK_CODE[planCode]) return PLAN_BY_PAYSTACK_CODE[planCode]
  return null
}

async function upsertPayment(
  supabase: ReturnType<typeof createClient>,
  tx: Record<string, unknown>,
  email: string,
  plan: string,
  billing: string,
  usdCents: number,
) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('payments').upsert({
    reference: tx.reference,
    email,
    plan,
    billing,
    amount: Number(tx.amount),
    usd_amount: usdCents,
    currency: (tx.currency || 'NGN').toUpperCase(),
    status: 'success',
    channel: tx.channel || null,
    customer_code: tx.customer?.customer_code || null,
    paid_at: tx.paid_at || now,
    paystack_response: tx,
    created_at: now,
  }, { onConflict: 'reference' })

  if (error) throw error
}

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  email: string,
  plan: string,
  billing: string,
  tx: Record<string, unknown>,
  usdCents: number,
) {
  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + (billing === 'annual' ? 12 : 1))

  const existing = await supabase
    .from('subscriptions')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  const record = {
    email,
    plan,
    billing_cycle: billing,
    amount: Number(tx.amount),
    usd_amount: usdCents,
    currency: (tx.currency || 'NGN').toUpperCase(),
    status: 'active',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    last_payment_reference: tx.reference,
    last_payment_date: tx.paid_at || now.toISOString(),
    updated_at: now.toISOString(),
  }

  let error: { message?: string } | null = null
  if (existing.data?.id) {
    ;({ error } = await supabase.from('subscriptions').update(record).eq('id', existing.data.id))
  } else {
    ;({ error } = await supabase.from('subscriptions').insert({ ...record, created_at: now.toISOString() }))
  }

  if (error) throw error
}

async function logWebhook(supabase: ReturnType<typeof createClient>, event: Record<string, unknown>) {
  const { error } = await supabase.from('payments').insert({
    reference: event?.data?.reference || 'unknown',
    email: event?.data?.customer?.email || '',
    plan: null,
    billing: 'monthly',
    amount: Number(event?.data?.amount) || 0,
    currency: (event?.data?.currency || 'NGN').toUpperCase(),
    status: 'unmapped',
    paystack_response: event,
    created_at: new Date().toISOString(),
  })
  if (error) console.error('logWebhook insert error:', error.message)
}
