import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_id', user.id)
      .single()

    if (!userProfile?.company_id) {
      return new Response(JSON.stringify({ error: 'User has no company' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { data: webhookConfig } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('company_id', userProfile.company_id)
      .eq('is_active', true)
      .single()

    if (!webhookConfig) {
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { event, data: eventData } = await req.json()
    
    const eventsToSend = webhookConfig.events || []
    if (!eventsToSend.includes('all') && !eventsToSend.includes(event)) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Event not subscribed',
        skipped: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      company_id: userProfile.company_id,
      data: eventData,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-ForgeFlow-Event': event,
      'X-ForgeFlow-Timestamp': payload.timestamp,
    }

    if (webhookConfig.webhook_secret) {
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookConfig.webhook_secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(payload)))
      headers['X-ForgeFlow-Signature'] = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    }

    const response = await fetch(webhookConfig.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    await supabase.from('integration_logs').insert({
      company_id: userProfile.company_id,
      provider: 'webhooks',
      action: 'webhook',
      status: response.ok ? 'success' : 'error',
      request_data: { event, url: webhookConfig.webhook_url },
      response_data: { status: response.status },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Webhook failed: ${response.status} - ${errorText}`)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Webhook delivered',
      event,
      status: response.status,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook send error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
