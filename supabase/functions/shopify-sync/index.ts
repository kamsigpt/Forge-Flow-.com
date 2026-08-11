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
      .eq('provider', 'shopify')
      .eq('is_active', true)
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Shopify not connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const shop = integration.metadata?.shop
    if (!shop) {
      return new Response(JSON.stringify({ error: 'Shop not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { action, data: actionData } = await req.json()
    let result = {}

    switch (action) {
      case 'get_products':
        result = await fetchShopifyProducts(integration.access_token, shop)
        break
      case 'get_orders':
        result = await fetchShopifyOrders(integration.access_token, shop, actionData?.since_id)
        break
      case 'update_inventory':
        result = await updateShopifyInventory(integration.access_token, shop, actionData)
        break
      case 'sync_products':
        result = await syncProductsToForgeFlow(supabase, userProfile.company_id, integration.access_token, shop)
        break
      case 'sync_orders':
        result = await syncOrdersToForgeFlow(supabase, userProfile.company_id, integration.access_token, shop)
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
      provider: 'shopify',
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
    console.error('Shopify sync error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function fetchShopifyProducts(accessToken: string, shop: string) {
  const response = await fetch(`https://${shop}/admin/api/2024-01/products.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`)
  }

  const data = await response.json()
  return { products: data.products, count: data.products?.length || 0 }
}

async function fetchShopifyOrders(accessToken: string, shop: string, sinceId?: string) {
  let url = `https://${shop}/admin/api/2024-01/orders.json?status=any`
  if (sinceId) {
    url += `&since_id=${sinceId}`
  }

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`)
  }

  const data = await response.json()
  return { orders: data.orders, count: data.orders?.length || 0 }
}

async function updateShopifyInventory(accessToken: string, shop: string, inventoryData: any) {
  const { inventory_item_id, location_id, quantity } = inventoryData

  const response = await fetch(`https://${shop}/admin/api/2024-01/inventory_levels/set.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location_id,
      inventory_item_id,
      available: quantity,
    }),
  })

  if (!response.ok) {
    throw new Error(`Shopify inventory update failed: ${response.statusText}`)
  }

  return await response.json()
}

async function syncProductsToForgeFlow(supabase: any, companyId: string, accessToken: string, shop: string) {
  const { products } = await fetchShopifyProducts(accessToken, shop)
  
  const syncedProducts = []
  
  for (const shopifyProduct of products) {
    const forgeProduct = {
      company_id: companyId,
      sku: `SHOP-${shopifyProduct.id}`,
      name: shopifyProduct.title,
      description: shopifyProduct.body_html?.replace(/<[^>]*>/g, ''),
      type: 'finished_good',
      unit_price: shopifyProduct.variants?.[0]?.price ? parseFloat(shopifyProduct.variants[0].price) : null,
      is_active: shopifyProduct.status === 'active',
      metadata: { shopify_id: shopifyProduct.id },
    }

    const { data, error } = await supabase
      .from('products')
      .upsert(forgeProduct, { onConflict: 'company_id,sku' })
      .select()
      .single()

    if (!error && data) {
      syncedProducts.push(data)
    }
  }

  return { synced: syncedProducts.length, products: syncedProducts }
}

async function syncOrdersToForgeFlow(supabase: any, companyId: string, accessToken: string, shop: string) {
  const { orders } = await fetchShopifyOrders(accessToken, shop)
  
  const syncedOrders = []
  
  for (const shopifyOrder of orders) {
    const customerName = `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim()
    
    const forgeOrder = {
      company_id: companyId,
      so_number: `SHOP-${shopifyOrder.id}`,
      customer_name: customerName || 'Shopify Customer',
      customer_email: shopifyOrder.customer?.email,
      customer_address: formatAddress(shopifyOrder.shipping_address),
      order_date: shopifyOrder.created_at?.split('T')[0],
      status: mapShopifyOrderStatus(shopifyOrder.financial_status, shopifyOrder.fulfillment_status),
      total_amount: parseFloat(shopifyOrder.total_price),
      metadata: { shopify_id: shopifyOrder.id },
    }

    const { data, error } = await supabase
      .from('sales_orders')
      .upsert(forgeOrder, { onConflict: 'company_id,so_number' })
      .select()
      .single()

    if (!error && data) {
      syncedOrders.push(data)
    }
  }

  return { synced: syncedOrders.length, orders: syncedOrders }
}

function formatAddress(address: any): string {
  if (!address) return ''
  const parts = [address.address1, address.address2, address.city, address.province, address.zip, address.country]
    .filter(Boolean)
  return parts.join(', ')
}

function mapShopifyOrderStatus(financialStatus: string, fulfillmentStatus: string): string {
  if (fulfillmentStatus === 'fulfilled') return 'shipped'
  if (financialStatus === 'paid') return 'confirmed'
  return 'draft'
}
