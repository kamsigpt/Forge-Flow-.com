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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing bearer token',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '').trim()
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { provider, redirectUrl, shop } = await req.json()
    if (!provider) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Provider is required',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_id', user.id)
      .single()

    if (profileError || !userProfile?.company_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User company context not found',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const statePayload: OAuthStatePayload = {
      provider,
      companyId: userProfile.company_id,
      userId: user.id,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomUUID(),
    }

    let authUrl = ''
    let scopes = ''

    switch (provider) {
      case 'gsheets': {
        authUrl = await generateGoogleAuthUrl(statePayload, redirectUrl)
        scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'
        break
      }
      case 'shopify': {
        const shopDomain = shop || safeShopDomainFromRedirect(redirectUrl) || Deno.env.get('SHOPIFY_DEFAULT_SHOP')
        if (!shopDomain) {
          throw new Error('Shopify shop domain is required')
        }
        statePayload.meta = { shop: shopDomain }
        authUrl = await generateShopifyAuthUrl(shopDomain, statePayload)
        scopes = 'read_products,write_products,read_orders,write_orders'
        break
      }
      case 'zoho': {
        authUrl = await generateZohoAuthUrl(statePayload)
        scopes = 'ZohoCRM.users.ALL,ZohoBooks.contacts.READ,ZohoProjects.tasks.WRITE'
        break
      }
      case 'quickbooks': {
        authUrl = await generateQuickBooksAuthUrl(statePayload, redirectUrl)
        scopes = 'com.intuit.quickbooks.accounting'
        break
      }
      case 'xero': {
        authUrl = await generateXeroAuthUrl(statePayload)
        scopes = 'openid profile email accounting.transactions accounting.contacts'
        break
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }

    return new Response(JSON.stringify({
      success: true,
      authUrl,
      scopes,
      provider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Auth URL generation error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

function safeShopDomainFromRedirect(redirectUrl?: string): string | null {
  try {
    if (!redirectUrl) return null
    return new URL(redirectUrl).searchParams.get('shop')
  } catch {
    return null
  }
}

async function signOAuthState(payload: OAuthStatePayload): Promise<string> {
  const secret = Deno.env.get('OAUTH_STATE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) throw new Error('Missing OAUTH_STATE_SECRET')

  const payloadEncoded = toBase64Url(JSON.stringify(payload))
  const signature = await hmacSha256Base64Url(secret, payloadEncoded)
  return `${payloadEncoded}.${signature}`
}

async function generateGoogleAuthUrl(payload: OAuthStatePayload, redirectUrl?: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const callbackUrl = Deno.env.get('GOOGLE_CALLBACK_URL') || `${new URL(redirectUrl || 'http://localhost').origin}/functions/v1/integrations/auth-callback`
  const state = await signOAuthState({ ...payload, provider: 'gsheets' })

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function generateShopifyAuthUrl(shop: string, payload: OAuthStatePayload) {
  const apiKey = Deno.env.get('SHOPIFY_API_KEY')
  const callbackUrl = Deno.env.get('SHOPIFY_CALLBACK_URL')
  if (!callbackUrl) throw new Error('Missing SHOPIFY_CALLBACK_URL')

  const state = await signOAuthState({ ...payload, provider: 'shopify' })
  const params = new URLSearchParams({
    client_id: apiKey!,
    scope: 'read_products,write_products,read_orders,write_orders',
    redirect_uri: callbackUrl,
    state,
  })

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

async function generateZohoAuthUrl(payload: OAuthStatePayload) {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const redirectUri = Deno.env.get('ZOHO_REDIRECT_URI')
  const state = await signOAuthState({ ...payload, provider: 'zoho' })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId!,
    redirect_uri: redirectUri!,
    scope: 'ZohoCRM.users.ALL,ZohoBooks.contacts.READ,ZohoProjects.tasks.WRITE',
    state,
  })

  return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`
}

async function generateQuickBooksAuthUrl(payload: OAuthStatePayload, redirectUrl?: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
  const redirectUri = Deno.env.get('QUICKBOOKS_CALLBACK_URL') || `${new URL(redirectUrl || 'http://localhost').origin}/functions/v1/integrations/auth-callback`
  const state = await signOAuthState({ ...payload, provider: 'quickbooks' })

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  })

  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
}

async function generateXeroAuthUrl(payload: OAuthStatePayload) {
  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const redirectUri = Deno.env.get('XERO_REDIRECT_URI')
  const state = await signOAuthState({ ...payload, provider: 'xero' })

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri!,
    response_type: 'code',
    scope: 'openid profile email accounting.transactions accounting.contacts',
    state,
  })

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - normalized.length % 4) % 4)
  return atob(normalized + padding)
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

export async function verifyOAuthState(rawState: string): Promise<OAuthStatePayload> {
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
