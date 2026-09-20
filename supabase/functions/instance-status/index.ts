import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

// Tells the Auth page whether this is a brand-new instance (no accounts
// yet, so show "create the first account" instead of "sign in"). Safe to
// expose with no auth check — it reveals nothing beyond a single boolean,
// never before a session exists.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { count, error } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })

    if (error) throw error

    return new Response(JSON.stringify({ hasAccounts: (count ?? 0) > 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    // Unauthenticated endpoint: keep database error text out of the response.
    console.error('instance-status error:', error)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
