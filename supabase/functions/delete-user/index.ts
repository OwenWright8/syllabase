import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Deletes the calling user's account and all of their data.
//
// Every user-owned table (profiles, courses, exams, tasks, readings,
// quizzes, study_items, notification_settings/log, widget_api_keys)
// references auth.users with ON DELETE CASCADE, so deleting the auth user
// removes everything in a single atomic step. (An earlier version deleted
// table by table first; that could leave a half-deleted account if any
// step failed, and had to be kept in sync with every new table.)
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Identify the caller from their own session token — never from the
    // request body — so a user can only ever delete themselves.
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return json({ error: 'Invalid token or user not found' }, 401)
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return json({ error: 'Failed to delete account' }, 500)
    }

    return json({ message: 'User account and all data successfully deleted' }, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return json({ error: 'An unexpected error occurred' }, 500)
  }
})
