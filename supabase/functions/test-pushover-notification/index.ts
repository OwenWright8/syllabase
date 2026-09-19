// Sends one test push using a caller-supplied Pushover app token + user
// key, so the Profile settings page can confirm both are correct before
// the user relies on them. Requires a logged-in session — not because we
// need to know which user is testing (each user brings their own app
// token), but to keep this from being an open relay for arbitrary Pushover
// credentials. Verified in-code (via GoTrue) rather than left to gateway
// config, so this holds regardless of how the deployment's internal
// gateway/edge runtime is set up.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token or user not found' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { pushover_user_key, pushover_app_token, pushover_device } = await req.json()

    if (!pushover_user_key || typeof pushover_user_key !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing pushover_user_key' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!pushover_app_token || typeof pushover_app_token !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing pushover_app_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const params: Record<string, string> = {
      token: pushover_app_token,
      user: pushover_user_key,
      title: 'Study Planner',
      message: "Test notification — if you're seeing this, your notifications are set up correctly.",
    }
    if (pushover_device && typeof pushover_device === 'string') {
      params.device = pushover_device
    }

    const pushoverRes = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })

    const pushoverData = await pushoverRes.json()

    if (!pushoverRes.ok || pushoverData.status !== 1) {
      const detail = Array.isArray(pushoverData.errors) ? pushoverData.errors.join(', ') : 'Pushover rejected the request'
      return new Response(JSON.stringify({ error: detail }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
