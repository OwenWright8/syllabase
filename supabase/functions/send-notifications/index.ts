import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

// Scheduled sweep (pg_cron, every ~15 min via pg_net) that checks every
// user's notification settings and pushes anything newly due through
// Pushover. Runs with the service role and is protected by a shared
// secret header instead of a user JWT, since pg_net has no Supabase
// session to attach — this header check is what actually guards it, so it
// fails closed: with no CRON_SECRET configured the function refuses to run
// rather than being open to anyone who can reach the gateway.

const DEFAULT_TIMEZONE = 'America/New_York'

/** Constant-time string comparison (hashes first so lengths never leak). */
async function secretsMatch(provided: string | null, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided ?? '')),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const av = new Uint8Array(a)
  const bv = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i]
  return diff === 0
}

const jsonHeaders = { 'Content-Type': 'application/json' }

/** Calendar date (YYYY-MM-DD) that `date` falls on in `timezone`. */
function ymdInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** HH:mm that `date` falls on in `timezone`. */
function hmInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

/** Minutes between two HH:mm times of day. */
function minutesBetweenHm(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return ah * 60 + am - (bh * 60 + bm)
}

interface Candidate {
  dedupeKey: string
  title: string
  message: string
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('CRON_SECRET is not set; refusing to run the notification sweep')
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: jsonHeaders })
  }
  if (!(await secretsMatch(req.headers.get('x-cron-secret'), cronSecret))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  let usersProcessed = 0
  let notificationsSent = 0

  try {
    const { data: settingsRows, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('enabled', true)
      .not('pushover_user_key', 'is', null)
      .not('pushover_app_token', 'is', null)

    if (settingsError) throw settingsError

    for (const settings of settingsRows ?? []) {
      usersProcessed++
      const userId = settings.user_id as string
      const pushoverUserKey = settings.pushover_user_key as string
      const pushoverAppToken = settings.pushover_app_token as string
      const pushoverDevice = settings.pushover_device as string | null

      const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle()
      const timezone = profile?.timezone || DEFAULT_TIMEZONE

      const todayYmd = ymdInTz(now, timezone)
      const candidates: Candidate[] = []

      // Assignments due within the configured lead window. A small grace
      // window on the past side avoids resurrecting everything already
      // overdue the first time a user turns this on.
      if (settings.assignments_enabled) {
        const windowEnd = new Date(now.getTime() + settings.assignments_lead_hours * 3600_000)
        const windowStart = new Date(now.getTime() - 6 * 3600_000)
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, due_at, course:courses(short_code)')
          .eq('user_id', userId)
          .neq('status', 'done')
          .not('due_at', 'is', null)
          .gte('due_at', windowStart.toISOString())
          .lte('due_at', windowEnd.toISOString())

        for (const task of tasks ?? []) {
          const course = Array.isArray(task.course) ? task.course[0] : task.course
          candidates.push({
            dedupeKey: `task:${task.id}:due_soon`,
            title: 'Assignment due soon',
            message: `${task.title}${course ? ` (${course.short_code})` : ''} is due soon`,
          })
        }
      }

      if (settings.exams_enabled) {
        const { data: exams } = await supabase
          .from('exams')
          .select('id, title, exam_at, course:courses(short_code)')
          .eq('user_id', userId)

        for (const exam of exams ?? []) {
          const examYmd = ymdInTz(new Date(exam.exam_at), timezone)
          const daysOut = daysBetweenYmd(todayYmd, examYmd)
          if ((settings.exams_lead_days ?? []).includes(daysOut)) {
            const course = Array.isArray(exam.course) ? exam.course[0] : exam.course
            candidates.push({
              dedupeKey: `exam:${exam.id}:lead_${daysOut}d`,
              title: daysOut === 0 ? 'Exam today' : `Exam in ${daysOut} day${daysOut === 1 ? '' : 's'}`,
              message: `${exam.title}${course ? ` (${course.short_code})` : ''}`,
            })
          }
        }
      }

      if (settings.quizzes_enabled) {
        const { data: quizzes } = await supabase
          .from('quizzes')
          .select('id, title, quiz_at, course:courses(short_code)')
          .eq('user_id', userId)

        for (const quiz of quizzes ?? []) {
          const quizYmd = ymdInTz(new Date(quiz.quiz_at), timezone)
          const daysOut = daysBetweenYmd(todayYmd, quizYmd)
          if ((settings.quizzes_lead_days ?? []).includes(daysOut)) {
            const course = Array.isArray(quiz.course) ? quiz.course[0] : quiz.course
            candidates.push({
              dedupeKey: `quiz:${quiz.id}:lead_${daysOut}d`,
              title: daysOut === 0 ? 'Quiz today' : `Quiz in ${daysOut} day${daysOut === 1 ? '' : 's'}`,
              message: `${quiz.title}${course ? ` (${course.short_code})` : ''}`,
            })
          }
        }
      }

      // Daily digest — fires once, in the ~15-minute window the cron tick
      // lands after the user's configured time.
      if (settings.daily_digest_enabled) {
        const nowHm = hmInTz(now, timezone)
        const digestHm = (settings.daily_digest_time as string).slice(0, 5)
        const minutesPast = minutesBetweenHm(nowHm, digestHm)
        if (minutesPast >= 0 && minutesPast < 15) {
          const [dueToday, plannedTasks, plannedReadings, plannedStudy] = await Promise.all([
            supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'done').gte('due_at', `${todayYmd}T00:00:00Z`).lt('due_at', `${todayYmd}T23:59:59Z`),
            supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'done').eq('work_date', todayYmd),
            supabase.from('readings').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'done').eq('planned_date', todayYmd),
            supabase.from('study_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'done').eq('planned_date', todayYmd),
          ])
          const plannedCount = (plannedTasks.count ?? 0) + (plannedReadings.count ?? 0) + (plannedStudy.count ?? 0)
          const dueCount = dueToday.count ?? 0
          if (plannedCount > 0 || dueCount > 0) {
            candidates.push({
              dedupeKey: `digest:${todayYmd}`,
              title: 'Your day ahead',
              message: `${dueCount} due today, ${plannedCount} planned. Open Study Planner to see your day.`,
            })
          }
        }
      }

      if (candidates.length === 0) continue

      const { data: alreadySent } = await supabase
        .from('notification_log')
        .select('dedupe_key')
        .eq('user_id', userId)
        .in('dedupe_key', candidates.map((c) => c.dedupeKey))

      const sentKeys = new Set((alreadySent ?? []).map((r) => r.dedupe_key))
      const toSend = candidates.filter((c) => !sentKeys.has(c.dedupeKey))

      for (const candidate of toSend) {
        const params: Record<string, string> = {
          token: pushoverAppToken,
          user: pushoverUserKey,
          title: candidate.title,
          message: candidate.message,
        }
        if (pushoverDevice) params.device = pushoverDevice

        const pushoverRes = await fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params),
        })

        if (pushoverRes.ok) {
          const body = await pushoverRes.json()
          if (body.status === 1) {
            await supabase.from('notification_log').insert({ user_id: userId, dedupe_key: candidate.dedupeKey })
            notificationsSent++
          } else {
            console.error(`Pushover rejected notification for user ${userId}:`, body.errors)
          }
        } else {
          console.error(`Pushover request failed for user ${userId}: ${pushoverRes.status}`)
        }
      }
    }

    return new Response(JSON.stringify({ usersProcessed, notificationsSent }), {
      status: 200,
      headers: jsonHeaders,
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: jsonHeaders,
    })
  }
})
