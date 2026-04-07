import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Auth helpers
export const signUp = async (email, password, metadata = {}) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  })
  return { data, error }
}

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

// Database helpers
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*, companies(*)')
    .eq('auth_id', userId)
    .single()
  return { data, error }
}

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('auth_id', userId)
    .select()
    .single()
  return { data, error }
}

// Products
export const getProducts = async (companyId) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .order('name')
  return { data, error }
}

// Inventory
export const getInventory = async (companyId) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, products(*), warehouses(*)')
    .eq('company_id', companyId)
  return { data, error }
}

// Manufacturing Orders
export const getManufacturingOrders = async (companyId) => {
  const { data, error } = await supabase
    .from('manufacturing_orders')
    .select('*, products(*), sales_orders(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return { data, error }
}

// Sales Orders
export const getSalesOrders = async (companyId) => {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return { data, error }
}
