import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// List of supported payment plans in USD cents. Keep in sync with payment.html.
const PLAN_AMOUNTS: Record<string, Record<string, number>> = {
  starter: { monthly: 15000, annual: 12000 },
  professional: { monthly: 25000, annual: 20000 },
}

const FALLBACK_RATE = 1361
const RATE_TOLERANCE = 0.03 // allow 3% drift between client fetch and server verify

async function fetchUsdToNgnRate(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return FALLBACK_RATE
    const data = await res.json()
    const rate = Number(data?.rates?.NGN)
    if (rate > 0) return rate
    return FALLBACK_RATE
  } catch (error) {
    console.error('rate fetch failed:', error)
    return FALLBACK_RATE
  }
}

function usdToNgnKobo(usdCents: number, rate: number): number {
  return Math.round((usdCents / 100) * rate) * 100
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!secretKey) {
      return json({ success: false, error: 'PAYSTACK_SECRET_KEY not configured' }, 500, corsHeaders)
    }

    const body = await req.json()
    const reference = body?.reference
    const expectedCurrency = body?.currency || 'NGN'
    const plan = body?.plan
    const billing = body?.billing || 'monthly'

    if (!reference) {
      return json({ success: false, error: 'Missing payment reference' }, 400, corsHeaders)
    }
    if (!plan || !PLAN_AMOUNTS[plan]) {
      return json({ success: false, error: 'Invalid plan' }, 400, corsHeaders)
    }
    if (!PLAN_AMOUNTS[plan][billing]) {
      return json({ success: false, error: 'Invalid billing' }, 400, corsHeaders)
    }

    const rate = await fetchUsdToNgnRate()
    const usdCents = PLAN_AMOUNTS[plan][billing]
    const expectedKobo = usdToNgnKobo(usdCents, rate)

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    )

    const paystack = await paystackRes.json()

    if (!paystackRes.ok || paystack.status !== true) {
      return json({
        success: false,
        error: paystack.message || 'Paystack verification failed',
        data: paystack.data || null,
      }, 400, corsHeaders)
    }

    const tx = paystack.data
    const paidAmount = Number(tx.amount)
    const paidCurrency = (tx.currency || 'USD').toUpperCase()
    const amountWithinTolerance = Math.abs(paidAmount - expectedKobo) / expectedKobo <= RATE_TOLERANCE
    const verified =
      tx.status === 'success' &&
      amountWithinTolerance &&
      paidCurrency === expectedCurrency.toUpperCase()

    const customerEmail = tx.customer?.email || body?.email || ''

    if (verified) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      await upsertPayment(supabase, tx, customerEmail, plan, billing, usdCents)
      await upsertSubscription(supabase, customerEmail, plan, billing, tx, usdCents)

      return json({
        success: true,
        verified: true,
        reference,
        data: {
          email: customerEmail,
          amount: paidAmount,
          currency: paidCurrency,
          plan,
          billing,
          rate,
          usdCents,
        },
      }, 200, corsHeaders)
    }

    return json({
      success: false,
      verified: false,
      error: 'Transaction did not pass verification',
      data: {
        status: tx.status,
        amount: paidAmount,
        expectedAmount: expectedKobo,
        currency: paidCurrency,
        expectedCurrency,
      },
    }, 400, corsHeaders)
  } catch (error) {
    console.error('paystack-verify error:', error)
    return json({ success: false, error: error.message || 'Internal error' }, 500, corsHeaders)
  }
})

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
    currency: (tx.currency || 'USD').toUpperCase(),
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
    currency: (tx.currency || 'USD').toUpperCase(),
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

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
