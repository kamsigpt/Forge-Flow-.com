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

    const { data: integration } = await supabase
      .from('integration_tokens')
      .select('*')
      .eq('company_id', userProfile.company_id)
      .eq('provider', 'zoho')
      .eq('is_active', true)
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Zoho not connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const apiDomain = integration.settings?.api_domain || 'https://www.zohoapis.com'
    const { action, data: actionData } = await req.json()
    let result = {}

    switch (action) {
      case 'test':
      case 'get_current_user':
        result = await getCurrentUser(apiDomain, integration.access_token)
        break
      case 'get_organization':
        result = await getOrganization(supabase, userProfile.company_id, integration, apiDomain)
        break
      case 'list_contacts':
        result = await listCrmContacts(apiDomain, integration.access_token, actionData?.page)
        break
      case 'list_invoices':
        result = await listBooksInvoices(supabase, userProfile.company_id, integration, apiDomain, actionData?.page)
        break
      case 'export_sales_orders':
        result = await exportSalesOrdersToBooks(supabase, userProfile.company_id, integration, apiDomain)
        break
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
    }

    await supabase.from('integration_tokens').update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id)

    await supabase.from('integration_logs').insert({
      company_id: userProfile.company_id,
      integration_id: integration.id,
      provider: 'zoho',
      action: 'sync',
      status: 'success',
      request_data: { action },
      response_data: result,
    })

    return new Response(JSON.stringify({
      success: true,
      data: result,
      last_sync: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Zoho sync error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function zohoFetch(apiDomain: string, path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${apiDomain}${path}`, {
    ...init,
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    let detail = await response.text()
    if (detail.length > 500) detail = detail.slice(0, 500)
    throw new Error(`Zoho API error ${response.status}: ${detail}`)
  }

  return await response.json()
}

async function getCurrentUser(apiDomain: string, accessToken: string) {
  const data = await zohoFetch(apiDomain, '/crm/v7/users?type=CurrentUser', accessToken)
  return { users: data.users || [] }
}

async function getOrganization(supabase: any, companyId: string, integration: any, apiDomain: string) {
  let organizationId = integration.settings?.organization_id || integration.metadata?.organization_id

  if (!organizationId) {
    const data = await zohoFetch(apiDomain, '/crm/v7/org', integration.access_token)
    const org = data.org?.[0]
    if (org?.company_id) {
      organizationId = String(org.company_id)
      await supabase.from('integration_tokens')
        .update({
          settings: { ...(integration.settings || {}), organization_id: organizationId },
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
    }
  }

  return {
    organization_id: organizationId || null,
    company_name: integration.settings?.company_name || null,
  }
}

async function resolveOrganizationId(supabase: any, integration: any, apiDomain: string): Promise<string> {
  const existing = integration.settings?.organization_id || integration.metadata?.organization_id
  if (existing) return String(existing)

  const data = await zohoFetch(apiDomain, '/crm/v7/org', integration.access_token)
  const org = data.org?.[0]
  if (!org?.company_id) throw new Error('Could not determine Zoho organization id. Use get_organization to set it.')

  const organizationId = String(org.company_id)
  await supabase.from('integration_tokens')
    .update({
      settings: { ...(integration.settings || {}), organization_id: organizationId },
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  return organizationId
}

async function listCrmContacts(apiDomain: string, accessToken: string, page = 1) {
  const data = await zohoFetch(apiDomain, `/crm/v7/Contacts?page=${page}&per_page=100`, accessToken)
  return { contacts: data.data || [], info: data.info || {} }
}

async function listBooksInvoices(supabase: any, companyId: string, integration: any, apiDomain: string, page = 1) {
  const organizationId = await resolveOrganizationId(supabase, integration, apiDomain)
  const data = await zohoFetch(
    apiDomain,
    `/books/v3/invoices?organization_id=${organizationId}&page=${page}&page_size=100`,
    integration.access_token,
  )
  return { invoices: data.invoices || [], page_context: data.page_context || {} }
}

async function exportSalesOrdersToBooks(supabase: any, companyId: string, integration: any, apiDomain: string) {
  const organizationId = await resolveOrganizationId(supabase, integration, apiDomain)

  const { data: orders, error } = await supabase
    .from('sales_orders')
    .select('*, sales_order_items(*, products(name, sku))')
    .eq('company_id', companyId)
    .in('status', ['confirmed', 'in_production', 'shipped', 'delivered'])
    .order('order_date', { ascending: false })
    .limit(50)

  if (error) throw error

  const pending = (orders || []).filter((order: any) => !order.metadata?.zoho_invoice_id)
  const exported = []
  const failed = []

  for (const order of pending) {
    try {
      const customerId = await findOrCreateBooksContact(
        apiDomain,
        integration.access_token,
        organizationId,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
      )

      const lineItems = (order.sales_order_items || []).map((item: any) => ({
        name: item.products?.name || `Item ${item.product_id || ''}`,
        description: item.products?.sku || '',
        quantity: Number(item.quantity_ordered) || 1,
        rate: Number(item.unit_price) || Number(item.products?.unit_price) || 0,
      }))

      if (lineItems.length === 0) {
        failed.push({ so_number: order.so_number, error: 'No line items to export' })
        continue
      }

      const invoice = await createBooksInvoice(
        apiDomain,
        integration.access_token,
        organizationId,
        customerId,
        order,
        lineItems,
      )

      await supabase.from('sales_orders')
        .update({
          metadata: {
            ...(order.metadata || {}),
            zoho_invoice_id: invoice.invoice_id,
            zoho_invoice_number: invoice.invoice_number,
            zoho_exported_at: new Date().toISOString(),
          },
        })
        .eq('id', order.id)

      exported.push({ so_number: order.so_number, zoho_invoice_id: invoice.invoice_id, zoho_invoice_number: invoice.invoice_number })
    } catch (err) {
      failed.push({ so_number: order.so_number, error: err.message })
    }
  }

  return { exported, failed, total_pending: pending.length }
}

async function findOrCreateBooksContact(
  apiDomain: string,
  accessToken: string,
  organizationId: string,
  contactName: string,
  contactEmail?: string | null,
  contactPhone?: string | null,
): Promise<string> {
  const search = contactEmail
    ? `&email_like=${encodeURIComponent(contactEmail)}`
    : `&search_text=${encodeURIComponent(contactName)}`

  const existing = await zohoFetch(
    apiDomain,
    `/books/v3/contacts?organization_id=${organizationId}${search}`,
    accessToken,
  )

  if (existing.contacts?.[0]?.contact_id) {
    return String(existing.contacts[0].contact_id)
  }

  const created = await zohoFetch(
    apiDomain,
    `/books/v3/contacts?organization_id=${organizationId}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        contact_name: contactName || 'ForgeFlow Customer',
        email: contactEmail || undefined,
        phone: contactPhone || undefined,
      }),
    },
  )

  if (!created.contact?.contact_id) {
    throw new Error('Zoho Books could not create contact')
  }

  return String(created.contact.contact_id)
}

async function createBooksInvoice(
  apiDomain: string,
  accessToken: string,
  organizationId: string,
  customerId: string,
  order: any,
  lineItems: any[],
) {
  const body: Record<string, unknown> = {
    customer_id: customerId,
    invoice_number: order.so_number,
    reference_number: order.so_number,
    date: order.order_date || new Date().toISOString().split('T')[0],
    due_date: order.expected_delivery_date || undefined,
    line_items: lineItems,
    notes: order.notes || undefined,
  }

  if (Number(order.subtotal) > 0) body.sub_total = Number(order.subtotal)
  if (Number(order.tax_amount) > 0) body.tax_amount = Number(order.tax_amount)
  if (Number(order.discount_amount) > 0) body.discount_amount = Number(order.discount_amount)

  const created = await zohoFetch(
    apiDomain,
    `/books/v3/invoices?organization_id=${organizationId}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )

  return created.invoice || {}
}
