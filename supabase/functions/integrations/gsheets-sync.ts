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
      .eq('provider', 'gsheets')
      .eq('is_active', true)
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Google Sheets not connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { action, data: actionData } = await req.json()
    let result = {}

    switch (action) {
      case 'list_spreadsheets':
        result = await listSpreadsheets(integration.access_token)
        break
      case 'get_spreadsheet':
        result = await getSpreadsheet(integration.access_token, actionData.spreadsheetId)
        break
      case 'export_inventory':
        result = await exportInventoryToSheet(supabase, userProfile.company_id, integration.access_token, actionData.spreadsheetId, actionData.sheetName)
        break
      case 'export_orders':
        result = await exportOrdersToSheet(supabase, userProfile.company_id, integration.access_token, actionData.spreadsheetId, actionData.sheetName)
        break
      case 'export_mfg':
        result = await exportMfgToSheet(supabase, userProfile.company_id, integration.access_token, actionData.spreadsheetId, actionData.sheetName)
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
      provider: 'gsheets',
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
    console.error('Google Sheets sync error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function listSpreadsheets(accessToken: string) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.spreadsheet%22',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.statusText}`)
  }

  const data = await response.json()
  return { 
    spreadsheets: data.files || [],
    count: data.files?.length || 0,
  }
}

async function getSpreadsheet(accessToken: string, spreadsheetId: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Google Sheets API error: ${response.statusText}`)
  }

  return await response.json()
}

async function exportInventoryToSheet(supabase: any, companyId: string, accessToken: string, spreadsheetId: string, sheetName: string = 'Inventory') {
  const { data: inventory } = await supabase
    .from('inventory')
    .select('*, products(*), warehouses(*)')
    .eq('company_id', companyId)

  const values = [
    ['Code', 'Product', 'Warehouse', 'Available', 'Allocated', 'Total', 'Status'],
    ...(inventory || []).map((inv: any) => [
      inv.products?.sku || '',
      inv.products?.name || '',
      inv.warehouses?.name || '',
      inv.quantity - inv.reserved_quantity,
      inv.reserved_quantity,
      inv.quantity,
      (inv.quantity - inv.reserved_quantity) <= (inv.products?.min_stock_level || 0) ? 'Low Stock' : 'OK',
    ])
  ]

  const body = {
    values,
  }

  const sheetTitle = sheetName.replace(/[^a-zA-Z0-9]/g, '_')
  
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  return { exported: inventory?.length || 0, sheet: sheetTitle }
}

async function exportOrdersToSheet(supabase: any, companyId: string, accessToken: string, spreadsheetId: string, sheetName: string = 'SalesOrders') {
  const { data: orders } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  const values = [
    ['Order #', 'Customer', 'Date', 'Status', 'Total'],
    ...(orders || []).map((order: any) => [
      order.so_number,
      order.customer_name,
      order.order_date,
      order.status,
      order.total_amount,
    ])
  ]

  const sheetTitle = sheetName.replace(/[^a-zA-Z0-9]/g, '_')

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  )

  return { exported: orders?.length || 0, sheet: sheetTitle }
}

async function exportMfgToSheet(supabase: any, companyId: string, accessToken: string, spreadsheetId: string, sheetName: string = 'Manufacturing') {
  const { data: orders } = await supabase
    .from('manufacturing_orders')
    .select('*, products(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  const values = [
    ['MO #', 'Product', 'Quantity', 'Status', 'Priority', 'Planned Start', 'Planned End'],
    ...(orders || []).map((order: any) => [
      order.mo_number,
      order.products?.name || '',
      order.quantity,
      order.status,
      order.priority,
      order.planned_start_date,
      order.planned_end_date,
    ])
  ]

  const sheetTitle = sheetName.replace(/[^a-zA-Z0-9]/g, '_')

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  )

  return { exported: orders?.length || 0, sheet: sheetTitle }
}
