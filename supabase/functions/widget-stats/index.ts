import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

// Read-only stats for third-party dashboards (e.g. a Homepage "Custom API"
// widget). Auth is a per-user API key from the `widget_api_keys` table,
// passed as the `X-Api-Key` header — not a Supabase session/JWT, since the
// caller (Homepage's server) isn't a logged-in app user.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const DEFAULT_TIMEZONE = 'America/New_York'

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Calendar date (YYYY-MM-DD) that `date` falls on in `timezone`. */
function ymdInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** 0 (Sun) .. 6 (Sat) for `date` in `timezone`. */
function weekdayInTz(date: Date, timezone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
  const index: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return index[wd] ?? 0
}

function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const apiKey = req.headers.get('X-Api-Key') ?? req.headers.get('x-api-key')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const keyHash = await sha256Hex(apiKey)

    const { data: keyRow, error: keyError } = await supabaseAdmin
      .from('widget_api_keys')
      .select('id, user_id')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyError || !keyRow) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = keyRow.user_id

    // Best-effort — don't fail the request if this write has trouble.
    await supabaseAdmin
      .from('widget_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id)

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle()
    const timezone = profile?.timezone || DEFAULT_TIMEZONE

    const { data: taskRows, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('due_at, work_date, status, course:courses (is_archived)')
      .eq('user_id', userId)

    if (taskError) {
      console.error('widget-stats task query error:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to load tasks' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tasks = (taskRows ?? []).filter((t) => {
      const course = Array.isArray(t.course) ? t.course[0] : t.course
      return !course?.is_archived
    })

    const now = new Date()
    const todayStr = ymdInTz(now, timezone)
    const dow = weekdayInTz(now, timezone)
    const weekStartStr = addDaysToYmd(todayStr, -dow)
    const weekEndStr = addDaysToYmd(todayStr, 6 - dow)

    let tasksDueToday = 0
    let tasksOverdue = 0
    let weekTotal = 0
    let weekCompleted = 0

    tasks.forEach((task) => {
      const isDone = task.status === 'done'

      if (!isDone && task.due_at) {
        const dueDateStr = ymdInTz(new Date(task.due_at), timezone)
        if (dueDateStr === todayStr) tasksDueToday++
        else if (dueDateStr < todayStr) tasksOverdue++
      }

      if (task.work_date && task.work_date >= weekStartStr && task.work_date <= weekEndStr) {
        weekTotal++
        if (isDone) weekCompleted++
      }
    })

    const weekCompletionPct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0

    const { data: examRows } = await supabaseAdmin
      .from('exams')
      .select('title, exam_at')
      .eq('user_id', userId)
      .gte('exam_at', now.toISOString())
      .order('exam_at', { ascending: true })
      .limit(1)

    const nextExam = examRows?.[0] ?? null
    const nextExamTitle = nextExam?.title ?? null
    const nextExamDays = nextExam
      ? Math.ceil((new Date(nextExam.exam_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    return new Response(
      JSON.stringify({
        tasks_due_today: tasksDueToday,
        tasks_overdue: tasksOverdue,
        week_completion_pct: weekCompletionPct,
        next_exam_title: nextExamTitle,
        next_exam_days: nextExamDays,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('widget-stats error:', error)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
