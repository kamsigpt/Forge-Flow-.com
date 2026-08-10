import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const FALLBACK_RATE = 1361

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rate = await fetchUsdToNgnRate()
    return json({
      success: true,
      base: 'USD',
      currency: 'NGN',
      rate,
      updatedAt: new Date().toISOString(),
    }, 200, corsHeaders)
  } catch (error) {
    console.error('paystack-rate error:', error)
    return json({ success: false, error: error.message || 'Internal error' }, 500, corsHeaders)
  }
})

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

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
