import { randomUUID } from "node:crypto";
import type { BrowserContext, Route } from "@playwright/test";

// An in-memory stand-in for the Supabase backend (GoTrue + PostgREST + the
// instance-status function), installed at the network layer with
// `context.route`, so the specs run with no server, database or Docker.
//
// It answers on the app's OWN origin (/auth/v1, /rest/v1, /functions/v1), just
// like the real gateway, because the app calls the address it was loaded from
// — there is no API URL to configure.
//
// It is deliberately dumb: GETs return the whole table (filters and ordering
// are ignored — the app filters client-side wherever it matters), embedded
// relations (`course`, `exam`, `quiz`) are joined in, and writes are applied
// to the in-memory tables and recorded on `writes`. That is enough to drive
// real user flows through the real UI and assert on what gets sent.

/** The origin the dev server (and so the app, and the fake) is served from. */
export const APP_ORIGIN = "http://localhost:8080";
export const USER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const COURSE_ID = "c0000000-0000-4000-8000-000000000001";

export type Row = { id: string } & Record<string, unknown>;

const TABLES = [
  "profiles",
  "courses",
  "tasks",
  "exams",
  "quizzes",
  "readings",
  "study_items",
  "notification_settings",
  "widget_api_keys",
] as const;
export type Table = (typeof TABLES)[number];

export interface Write {
  table: Table;
  method: "POST" | "PATCH" | "DELETE";
  body: Record<string, unknown>[];
}

export interface FakeBackendOptions {
  /** Profile timezone (defaults to America/New_York, like a fresh account). */
  timezone?: string;
  themePreference?: string;
  colorTheme?: string;
  /** Answer to the first-run check on the sign-in page. */
  hasAccounts?: boolean;
  /** Start with a stored session (default true). */
  signedIn?: boolean;
  courses?: Row[];
  tasks?: Row[];
  /** Origin the app is loaded from (default: APP_ORIGIN). */
  origin?: string;
}

export class FakeBackend {
  readonly db: Record<Table, Row[]>;
  readonly writes: Write[] = [];
  readonly requests: { table: string; method: string }[] = [];
  /** How long to hold PATCH responses back — lets a spec observe optimistic UI. */
  /** Requests to /auth/v1/user (a network round trip the app can usually avoid). */
  authUserRequests = 0;
  patchDelayMs = 0;
  /** Answer PATCHes with a 500, to exercise rollback. */
  failPatches = false;
  private readonly hasAccounts: boolean;

  constructor(options: FakeBackendOptions) {
    this.hasAccounts = options.hasAccounts ?? true;
    this.db = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as Record<Table, Row[]>;
    this.db.profiles.push({
      id: USER_ID,
      email: "me@accounts.local",
      timezone: options.timezone ?? "America/New_York",
      color_theme: options.colorTheme ?? "sage",
      theme_preference: options.themePreference ?? "light",
      semester_start: null,
    });
    this.db.courses.push(...(options.courses ?? []));
    this.db.tasks.push(...(options.tasks ?? []));
  }

  /** Rows of `table` the app has POSTed, in order. */
  posts(table: Table): Record<string, unknown>[] {
    return this.writes.filter((w) => w.table === table && w.method === "POST").flatMap((w) => w.body);
  }

  /** Bodies of PATCH requests the app has sent to `table`, in order. */
  patches(table: Table): Record<string, unknown>[] {
    return this.writes.filter((w) => w.table === table && w.method === "PATCH").flatMap((w) => w.body);
  }

  /** How many requests of `method` hit `table` so far. */
  count(table: Table, method = "GET"): number {
    return this.requests.filter((r) => r.table === table && r.method === method).length;
  }

  private withRelations(row: Row): Row {
    const out: Row = { ...row };
    if ("course_id" in row) out.course = this.db.courses.find((c) => c.id === row.course_id) ?? null;
    if ("exam_id" in row) out.exam = this.db.exams.find((e) => e.id === row.exam_id) ?? null;
    if ("quiz_id" in row) out.quiz = this.db.quizzes.find((q) => q.id === row.quiz_id) ?? null;
    return out;
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...cors, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user") {
      this.authUserRequests++;
      return json(200, { id: USER_ID, email: "me@accounts.local", aud: "authenticated", role: "authenticated" });
    }
    if (url.pathname === "/functions/v1/instance-status") return json(200, { hasAccounts: this.hasAccounts });

    const match = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const table = match?.[1] as Table | undefined;
    if (!table || !(table in this.db)) return json(200, []);
    this.requests.push({ table, method });

    if (method === "GET" || method === "HEAD") {
      const rows = this.db[table].map((r) => this.withRelations(r));
      if ((request.headers()["accept"] ?? "").includes("vnd.pgrst.object")) {
        return rows.length ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "no rows", details: "", hint: null });
      }
      return json(200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
    }

    if (method === "POST") {
      const body = JSON.parse(request.postData() ?? "[]") as Record<string, unknown> | Record<string, unknown>[];
      const items = Array.isArray(body) ? body : [body];
      const stored = items.map((item): Row => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "not_started",
        completed_at: null,
        ...item,
      }));
      this.db[table].push(...stored);
      this.writes.push({ table, method, body: items });
      const wantsBody = (request.headers()["prefer"] ?? "").includes("return=representation");
      return wantsBody ? json(201, stored.map((r) => this.withRelations(r))) : route.fulfill({ status: 201, headers: cors, body: "" });
    }

    if (method === "PATCH") {
      const patch = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      this.writes.push({ table, method, body: [patch] });
      if (this.patchDelayMs) await new Promise((resolve) => setTimeout(resolve, this.patchDelayMs));
      if (this.failPatches) return json(500, { code: "XX000", message: "boom", details: "", hint: null });
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const row = this.db[table].find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return route.fulfill({ status: 204, headers: cors });
    }

    if (method === "DELETE") {
      this.writes.push({ table, method, body: [] });
      const id = url.searchParams.get("id")?.replace("eq.", "");
      this.db[table] = this.db[table].filter((r) => r.id !== id);
      return route.fulfill({ status: 204, headers: cors });
    }

    return json(405, {});
  }
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Point the context's app at a fresh in-memory backend (and, by default, a stored session). */
export async function installFakeBackend(context: BrowserContext, options: FakeBackendOptions = {}): Promise<FakeBackend> {
  const backend = new FakeBackend(options);
  const origin = options.origin ?? APP_ORIGIN;
  // Only the backend's paths: the page itself and its assets come from the dev server.
  for (const prefix of ["/auth/v1", "/rest/v1", "/functions/v1"]) {
    await context.route(`${origin}${prefix}/**`, (route) => backend.handle(route));
  }

  if (options.signedIn !== false) {
    const jwt = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: USER_ID, role: "authenticated", exp: 4102444800 })}.sig`;
    const session = {
      access_token: jwt,
      refresh_token: "e2e-refresh",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: USER_ID, email: "me@accounts.local", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    };
    // supabase-js keys its stored session by the API host's first label (localhost -> "localhost", 127.0.0.1 -> "127").
    const storageKey = `sb-${new URL(origin).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  }
  return backend;
}

export function makeCourse(overrides: Partial<Row> = {}): Row {
  return { id: COURSE_ID, user_id: USER_ID, name: "General Chemistry", short_code: "CHEM 111", color: "#3b82f6", semester: "Fall", is_archived: false, created_at: new Date().toISOString(), ...overrides };
}

/** A task due in three hours and not scheduled for a day, so it lands in Today's "Due Soon" list. */
export function makeTask(overrides: Partial<Row> = {}): Row {
  return {
    id: randomUUID(),
    user_id: USER_ID,
    course_id: null,
    exam_id: null,
    title: "Seed task",
    description: null,
    type: "homework",
    due_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
    work_date: null,
    estimated_minutes: 60,
    priority: "medium",
    status: "not_started",
    completed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Calendar date (YYYY-MM-DD) of `date` in `timeZone`. */
export function ymdInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** `ymd` shifted by whole days (pure calendar arithmetic, so no timezone can skew it). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetweenYmd(from: string, to: string): number {
  const ms = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** 0 (Sunday) … 6 (Saturday) for `date` in `timeZone`. */
export function weekdayInTz(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
