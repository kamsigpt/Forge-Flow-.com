import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OAuthStatePayload = {
  provider: string
  companyId: string
  userId: string
  exp: number
  nonce: string
  meta?: Record<string, string>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const rawState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error,
        error_description: url.searchParams.get('error_description'),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!code || !rawState) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required OAuth parameters',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const state = await verifyOAuthState(rawState)
    const provider = state.provider
    const companyId = state.companyId

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let tokenData: Record<string, unknown> = {}

    switch (provider) {
      case 'gsheets':
        tokenData = await exchangeGoogleCode(code)
        break
      case 'shopify':
        tokenData = await exchangeShopifyCode(code, state.meta?.shop || url.searchParams.get('shop'))
        break
      case 'zoho':
        tokenData = await exchangeZohoCode(code)
        break
      case 'quickbooks':
        tokenData = await exchangeQuickBooksCode(code, url.searchParams.get('realmId') || undefined)
        break
      case 'xero':
        tokenData = await exchangeXeroCode(code)
        break
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }

    const expiresIn = typeof tokenData.expires_in === 'number'
      ? tokenData.expires_in
      : null

    const { error: dbError } = await supabase
      .from('integration_tokens')
      .upsert({
        company_id: companyId,
        provider: provider,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope || null,
        metadata: tokenData.metadata || {},
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,provider' })

    if (dbError) throw dbError

    await supabase.from('integration_logs').insert({
      company_id: companyId,
      provider: provider,
      action: 'connect',
      status: 'success',
      response_data: { message: 'OAuth flow completed successfully' },
    })

    return new Response(JSON.stringify({
      success: true,
      provider,
      message: 'Integration connected successfully',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Auth callback error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function exchangeGoogleCode(code: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const callbackUrl = Deno.env.get('GOOGLE_CALLBACK_URL')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: callbackUrl!,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token exchange failed: ${error}`)
  }

  return await response.json()
}

async function exchangeShopifyCode(code: string, shop?: string | null) {
  if (!shop) throw new Error('Missing Shopify shop domain')
  const apiKey = Deno.env.get('SHOPIFY_API_KEY')
  const apiSecret = Deno.env.get('SHOPIFY_API_SECRET')

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Shopify token exchange failed: ${error}`)
  }

  const data = await response.json()
  return {
    access_token: data.access_token,
    token_type: 'Bearer',
    scope: data.scope,
    metadata: { shop },
  }
}

async function exchangeZohoCode(code: string) {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')
  const redirectUri = Deno.env.get('ZOHO_REDIRECT_URI')

  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri!,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Zoho token exchange failed: ${error}`)
  }

  return await response.json()
}

async function exchangeQuickBooksCode(code: string, realmId?: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')
  const callbackUrl = Deno.env.get('QUICKBOOKS_CALLBACK_URL')

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: callbackUrl!,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`QuickBooks token exchange failed: ${error}`)
  }

  const data = await response.json()
  return {
    ...data,
    metadata: realmId ? { realmId } : {},
  }
}

async function exchangeXeroCode(code: string) {
  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')
  const redirectUri = Deno.env.get('XERO_REDIRECT_URI')

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri!,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Xero token exchange failed: ${error}`)
  }

  return await response.json()
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - normalized.length % 4) % 4)
  return atob(normalized + padding)
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return toBase64Url(binary)
}

async function verifyOAuthState(rawState: string): Promise<OAuthStatePayload> {
  const [payloadEncoded, signature] = rawState.split('.')
  if (!payloadEncoded || !signature) throw new Error('Invalid OAuth state format')

  const secret = Deno.env.get('OAUTH_STATE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) throw new Error('Missing OAUTH_STATE_SECRET')

  const expected = await hmacSha256Base64Url(secret, payloadEncoded)
  if (expected !== signature) throw new Error('Invalid OAuth state signature')

  const payload = JSON.parse(fromBase64Url(payloadEncoded)) as OAuthStatePayload
  if (!payload.exp || Date.now() > payload.exp) throw new Error('OAuth state expired')
  if (!payload.provider || !payload.companyId || !payload.userId) {
    throw new Error('OAuth state missing required values')
  }
  return payload
}
