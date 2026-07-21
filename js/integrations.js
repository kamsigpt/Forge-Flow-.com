import { supabase } from './supabase.js'

export const IntegrationService = {
  providers: {
    zoho: {
      name: 'Zoho Suite',
      color: '#CB3737',
      icon: 'Z',
      features: ['CRM Sync', 'Invoices', 'Projects'],
      authType: 'oauth2',
    },
    shopify: {
      name: 'Shopify',
      color: '#96BF48',
      icon: 'S',
      features: ['Orders', 'Products', 'Inventory'],
      authType: 'oauth2',
    },
    quickbooks: {
      name: 'QuickBooks',
      color: '#2CA01C',
      icon: 'Q',
      features: ['Invoices', 'Expenses', 'Payments'],
      authType: 'oauth2',
    },
    gsheets: {
      name: 'Google Sheets',
      color: '#0F9D58',
      icon: 'G',
      features: ['Import', 'Export', 'Reports'],
      authType: 'oauth2',
    },
  },

  async getAuthUrl(provider) {
    try {
      const { data, error } = await supabase.functions.invoke('integrations/auth-url', {
        body: { 
          provider,
          redirectUrl: window.location.origin + window.location.pathname,
        },
      })

      if (error) throw error
      return data.authUrl
    } catch (error) {
      console.error('Failed to get auth URL:', error)
      throw error
    }
  },

  async connect(provider) {
    const config = this.providers[provider]
    if (!config) throw new Error(`Unknown provider: ${provider}`)

    if (provider === 'webhooks') {
      return { requiresConfig: true }
    }

    try {
      const authUrl = await this.getAuthUrl(provider)
      
      localStorage.setItem(`forgeflow_oauth_pending_${provider}`, JSON.stringify({
        timestamp: Date.now(),
      }))

      window.location.href = authUrl
      return { redirecting: true }
    } catch (error) {
      console.error(`Failed to connect ${config.name}:`, error)
      throw error
    }
  },

  async disconnect(provider) {
    const config = this.providers[provider]
    if (!config) throw new Error(`Unknown provider: ${provider}`)

    try {
      const { error } = await supabase
        .from('integration_tokens')
        .update({ is_active: false })
        .eq('provider', provider)

      if (error) throw error

      await this.logAction(provider, 'disconnect', 'success')

      return { success: true }
    } catch (error) {
      console.error(`Failed to disconnect ${config.name}:`, error)
      throw error
    }
  },

  async getStatus(provider) {
    try {
      const { data, error } = await supabase
        .from('integration_tokens')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return {
        connected: !!data,
        lastSync: data?.last_sync_at,
        settings: data?.settings || {},
        metadata: data?.metadata || {},
      }
    } catch (error) {
      console.error(`Failed to get ${provider} status:`, error)
      return { connected: false }
    }
  },

  async getAllStatuses() {
    const statuses = {}
    for (const provider of Object.keys(this.providers)) {
      statuses[provider] = await this.getStatus(provider)
    }
    return statuses
  },

  async saveSettings(provider, settings) {
    try {
      const { error } = await supabase
        .from('integration_tokens')
        .update({ 
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq('provider', provider)
        .eq('is_active', true)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error(`Failed to save settings for ${provider}:`, error)
      throw error
    }
  },

  async saveWebhookConfig(url, secret, events) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: userProfile } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_id', user.id)
        .single()

      if (!userProfile?.company_id) throw new Error('No company found')

      const { error } = await supabase
        .from('webhook_configs')
        .upsert({
          company_id: userProfile.company_id,
          webhook_url: url,
          webhook_secret: secret,
          events: events,
          is_active: true,
        }, { onConflict: 'company_id' })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Failed to save webhook config:', error)
      throw error
    }
  },

  async triggerWebhook(event, data) {
    try {
      const result = await this.sendWebhook(event, data)
      return result
    } catch (error) {
      console.warn('Webhook trigger failed:', error.message)
      return { success: false, error: error.message }
    }
  },

  async sync(provider, action, data = {}) {
    try {
      let result

      switch (provider) {
        case 'shopify':
          result = await this.syncShopify(action, data)
          break
        case 'gsheets':
          result = await this.syncGoogleSheets(action, data)
          break
        case 'webhooks':
          result = await this.sendWebhook(action, data)
          break
        default:
          throw new Error(`Sync not supported for ${provider}`)
      }

      await this.logAction(provider, 'sync', 'success', { action, data: result })
      return result
    } catch (error) {
      await this.logAction(provider, 'sync', 'error', { action, error: error.message })
      throw error
    }
  },

  async syncShopify(action, data = {}) {
    const { data: result, error } = await supabase.functions.invoke('integrations/shopify-sync', {
      body: { action, data },
    })

    if (error) throw error
    return result
  },

  async syncGoogleSheets(action, data = {}) {
    const { data: result, error } = await supabase.functions.invoke('integrations/gsheets-sync', {
      body: { action, data },
    })

    if (error) throw error
    return result
  },

  async sendWebhook(event, data = {}) {
    const { data: result, error } = await supabase.functions.invoke('integrations/webhook-sender', {
      body: { event, data },
    })

    if (error) throw error
    return result
  },

  async getLogs(provider, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('integration_logs')
        .select('*')
        .eq('provider', provider)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error(`Failed to get logs for ${provider}:`, error)
      return []
    }
  },

  async logAction(provider, action, status, details = {}) {
    try {
      await supabase.from('integration_logs').insert({
        provider,
        action,
        status,
        request_data: details.request,
        response_data: details.response,
        error_message: details.error,
      })
    } catch (error) {
      console.error('Failed to log action:', error)
    }
  },

  async testConnection(provider) {
    try {
      let testResult

      switch (provider) {
        case 'shopify':
          testResult = await this.syncShopify('get_products')
          break
        case 'gsheets':
          testResult = await this.syncGoogleSheets('list_spreadsheets')
          break
        default:
          testResult = await this.getStatus(provider)
      }

      await this.logAction(provider, 'test', 'success', { response: testResult })
      return { success: true, data: testResult }
    } catch (error) {
      await this.logAction(provider, 'test', 'error', { error: error.message })
      return { success: false, error: error.message }
    }
  },

  handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    const provider = params.get('provider')

    if (error) {
      return { success: false, error, description: params.get('error_description') }
    }

    if (code && provider) {
      localStorage.setItem(`forgeflow_oauth_completed_${provider}`, JSON.stringify({
        code,
        timestamp: Date.now(),
      }))

      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)

      return { success: true, provider, code }
    }

    return null
  },

  async checkOAuthCompletion(provider) {
    const completed = localStorage.getItem(`forgeflow_oauth_completed_${provider}`)
    if (completed) {
      localStorage.removeItem(`forgeflow_oauth_completed_${provider}`)
      localStorage.removeItem(`forgeflow_oauth_pending_${provider}`)
      return JSON.parse(completed)
    }
    return null
  },
}

window.IntegrationService = IntegrationService
