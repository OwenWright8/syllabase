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
  "course_documents",
  "course_document_chunks",
  "document_pages",
  "document_limits",
  "document_chapters",
  "document_extracts",
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
  /** The profile's semester start (YYYY-MM-DD). */
  semesterStart?: string;
  themePreference?: string;
  colorTheme?: string;
  /** Answer to the first-run check on the sign-in page. */
  hasAccounts?: boolean;
  /** Start with a stored session (default true). */
  signedIn?: boolean;
  courses?: Row[];
  tasks?: Row[];
  documents?: Row[];
  chapters?: Row[];
  /** Extracted text of documents (one row per page: document_id, page, text). */
  pages?: Row[];
  readings?: Row[];
  /** Override the upload limits (same names as the document_limits columns). */
  documentLimits?: Partial<{ enabled: boolean; max_file_bytes: number; max_user_bytes: number; max_pages: number; max_documents: number }>;
  /** Origin the app is loaded from (default: APP_ORIGIN). */
  origin?: string;
}

/** What the fake "worker" does with a document once it is queued. */
export type WorkerOutcome = { status: "ready"; page_count: number } | { status: "failed"; error: string };

/** What the fake worker does with a requested page range. */
export type ExtractOutcome = { status: "ready"; bytes: Buffer } | { status: "failed"; error: string };

/** One piece of an extract, in bytes: what extract_piece() returns per call (see the migration). */
export const PIECE_BYTES = 786432;

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
  /** How long the fake worker takes per stage (queued -> processing -> done). */
  workerDelayMs = 150;
  /** Decide each queued document's fate (default: ready, 12 pages). */
  workerOutcome: (doc: Row) => WorkerOutcome = () => ({ status: "ready", page_count: 12 });
  /** Answer the chunk with this sequence number with a 500 (upload dies part-way). */
  failChunkAt: number | null = null;
  /** Decide what each requested page range turns into (default: a small PDF-looking file). */
  extractOutcome: (extract: Row) => ExtractOutcome = (extract) => ({
    status: "ready",
    bytes: Buffer.from(`%PDF-1.7 fake extract of pages ${extract.start_page}-${extract.end_page}`),
  });
  /** How many extract_piece() calls have been answered. */
  pieceRequests = 0;
  private readonly extractData = new Map<string, Buffer>();
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
      semester_start: options.semesterStart ?? null,
    });
    this.db.courses.push(...(options.courses ?? []));
    this.db.tasks.push(...(options.tasks ?? []));
    this.db.course_documents.push(...(options.documents ?? []));
    this.db.document_chapters.push(...(options.chapters ?? []));
    this.db.document_pages.push(...(options.pages ?? []));
    this.db.readings.push(...(options.readings ?? []));
    this.db.document_limits.push({
      id: "limits",
      singleton: true,
      enabled: true,
      max_file_bytes: 200 * 1024 * 1024,
      max_user_bytes: 1024 * 1024 * 1024,
      max_pages: 1500,
      max_documents: 200,
      ...options.documentLimits,
    });
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
    if ("document_id" in row) out.document = this.db.course_documents.find((d) => d.id === row.document_id) ?? null;
    return out;
  }

  // --- the database rules for course documents, as the migration defines them ---

  private get limits() {
    return this.db.document_limits[0] as Row & { enabled: boolean; max_file_bytes: number; max_user_bytes: number };
  }

  private hexBytes(value: unknown): number {
    return typeof value === "string" && value.startsWith("\\x") ? (value.length - 2) / 2 : 0;
  }

  private rlsRefusal(table: string) {
    return { status: 403, body: { code: "42501", message: `new row violates row-level security policy for table "${table}"`, details: null, hint: null } };
  }

  /** The INSERT policy on course_documents: own course, uploads on, within the file and per-user limits. */
  private checkNewDocument(item: Record<string, unknown>) {
    const used = this.db.course_documents.reduce((total, d) => total + Number(d.size_bytes), 0);
    const size = Number(item.size_bytes);
    const ownCourse = this.db.courses.some((c) => c.id === item.course_id);
    if (!ownCourse || !this.limits.enabled || !(size > 0) || size > this.limits.max_file_bytes || used + size > this.limits.max_user_bytes) {
      return this.rlsRefusal("course_documents");
    }
    return null;
  }

  /** The chunk trigger: 1 byte..1 MiB, document still uploading, never past the declared size. */
  private checkChunk(item: Record<string, unknown>) {
    const bad = (message: string) => ({ status: 400, body: { code: "23514", message, details: null, hint: null } });
    if (this.failChunkAt !== null && Number(item.seq) === this.failChunkAt) {
      return { status: 500, body: { code: "XX000", message: "boom", details: "", hint: null } };
    }
    const bytes = this.hexBytes(item.data);
    if (bytes === 0 || bytes > 1048576) return bad(`A chunk must be between 1 byte and 1 MiB (got ${bytes} bytes).`);
    const doc = this.db.course_documents.find((d) => d.id === item.document_id);
    if (!doc || doc.status !== "uploading") return bad("That document is not accepting chunks.");
    if (Number(doc.uploaded_bytes) + bytes > Number(doc.size_bytes)) return bad("The chunks are larger than the declared file size.");
    return null;
  }

  /** The update trigger: a user may only queue an uploading/failed document, and only once fully uploaded. */
  private checkQueue(doc: Row, next: string) {
    const bad = (message: string) => ({ code: "23514", message, details: null, hint: null });
    if (!(["uploading", "failed"].includes(String(doc.status)) && next === "queued")) {
      return bad(`A document can only be queued for processing (from uploading or failed), not moved from ${doc.status} to ${next}.`);
    }
    if (doc.status === "uploading" && Number(doc.uploaded_bytes) !== Number(doc.size_bytes)) {
      return bad(`The upload is incomplete (${doc.uploaded_bytes} of ${doc.size_bytes} bytes).`);
    }
    return null;
  }

  /** The chapter trigger: the user's own read textbook, a range inside it, always recorded as manual, at most 500. */
  private checkChapter(item: Record<string, unknown>, existing?: Row) {
    const bad = (message: string) => ({ status: 400, body: { code: "23514", message, details: null, hint: null } });
    const doc = this.db.course_documents.find((d) => d.id === (item.document_id ?? existing?.document_id));
    if (!doc || doc.kind !== "textbook") return bad("Chapters can only be added to one of your own textbooks.");
    if (doc.status !== "ready") return bad("That textbook has not been read yet.");
    const start = Number(item.start_page ?? existing?.start_page);
    const end = Number(item.end_page ?? existing?.end_page);
    if (!(start >= 1) || end < start) return bad("new row violates check constraint");
    if (end > Number(doc.page_count)) return bad(`That range ends after the last page (the book has ${doc.page_count} pages).`);
    if (!existing && this.db.document_chapters.filter((c) => c.document_id === doc.id).length >= 500) return bad("A book can have at most 500 chapters.");
    return null;
  }

  /** The readings trigger + constraint: a link is to the user's own document, and the pages come as a valid pair. */
  private checkReading(item: Record<string, unknown>) {
    const bad = (message: string) => ({ status: 400, body: { code: "23514", message, details: null, hint: null } });
    if (item.document_id && !this.db.course_documents.some((d) => d.id === item.document_id)) return bad("A reading can only link to one of your own documents.");
    const hasStart = item.start_page != null;
    const hasEnd = item.end_page != null;
    if (hasStart !== hasEnd || (hasStart && Number(item.end_page) < Number(item.start_page))) return bad('new row violates check constraint "readings_page_range"');
    return null;
  }

  /** The extract trigger + unique constraint: own read textbook, a real range, uploads on, at most 10 open, no duplicates. */
  private checkExtract(item: Record<string, unknown>) {
    const bad = (message: string, code = "23514") => ({ status: code === "23505" ? 409 : 400, body: { code, message, details: null, hint: null } });
    const doc = this.db.course_documents.find((d) => d.id === item.document_id);
    if (!doc || doc.kind !== "textbook" || doc.status !== "ready") return bad("Pages can only be taken from one of your own textbooks that has been read.");
    if (Number(item.end_page) < Number(item.start_page) || Number(item.start_page) < 1) return bad("new row violates check constraint");
    if (Number(item.end_page) > Number(doc.page_count)) return bad(`That range ends after the last page (the book has ${doc.page_count} pages).`);
    if (!this.limits.enabled) return bad("Course materials are switched off on this server.");
    if (this.db.document_extracts.length >= 10) return bad("Too many downloads are being prepared at once. Wait for one to finish.");
    if (this.db.document_extracts.some((e) => e.document_id === item.document_id && e.start_page === item.start_page && e.end_page === item.end_page)) {
      return bad("duplicate key value violates unique constraint", "23505");
    }
    return null;
  }

  /** Stand-in for the worker's extract job: pending -> processing -> ready/failed. */
  private simulateExtract(extract: Row) {
    setTimeout(() => {
      if (!this.db.document_extracts.includes(extract)) return;
      extract.status = "processing";
      setTimeout(() => {
        if (!this.db.document_extracts.includes(extract)) return;
        const outcome = this.extractOutcome(extract);
        if (outcome.status === "ready") {
          this.extractData.set(String(extract.id), outcome.bytes);
          Object.assign(extract, { status: "ready", size_bytes: outcome.bytes.length });
        } else {
          Object.assign(extract, { status: "failed", error: outcome.error });
        }
      }, this.workerDelayMs);
    }, this.workerDelayMs);
  }

  /** Stand-in for the worker: queued -> processing -> ready/failed. */
  private simulateWorker(doc: Row) {
    setTimeout(() => {
      if (!this.db.course_documents.includes(doc)) return; // deleted meanwhile
      Object.assign(doc, { status: "processing", progress: 40, error: null });
      setTimeout(() => {
        if (!this.db.course_documents.includes(doc)) return;
        const outcome = this.workerOutcome(doc);
        Object.assign(doc, outcome.status === "ready" ? { status: "ready", progress: 100, page_count: outcome.page_count } : { status: "failed", error: outcome.error });
      }, this.workerDelayMs);
    }, this.workerDelayMs);
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

    if (url.pathname === "/rest/v1/rpc/extract_piece" && method === "POST") {
      this.pieceRequests++;
      const args = JSON.parse(request.postData() ?? "{}") as { p_extract?: string; p_piece?: number };
      const extract = this.db.document_extracts.find((e) => e.id === args.p_extract);
      const bytes = extract?.status === "ready" ? this.extractData.get(String(extract.id)) : undefined;
      const piece = Number(args.p_piece);
      if (!bytes || !(piece >= 0)) return json(200, null);
      return json(200, bytes.subarray(piece * PIECE_BYTES, (piece + 1) * PIECE_BYTES).toString("base64"));
    }

    const match = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const table = match?.[1] as Table | undefined;
    if (!table || !(table in this.db)) return json(200, []);
    this.requests.push({ table, method });

    if (method === "GET" || method === "HEAD") {
      // The fake mostly ignores filters, but equality on these ids matters to how
      // the app scopes documents (per course, per document).
      let source = this.db[table];
      for (const column of ["course_id", "document_id", "id", "start_page", "end_page"]) {
        const wanted = url.searchParams.get(column);
        if (wanted?.startsWith("eq.")) source = source.filter((r) => !(column in r) || String(r[column]) === wanted.slice(3));
      }
      const rows = source.map((r) => this.withRelations(r));
      if ((request.headers()["accept"] ?? "").includes("vnd.pgrst.object")) {
        return rows.length ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "no rows", details: "", hint: null });
      }
      return json(200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
    }

    if (method === "POST") {
      const body = JSON.parse(request.postData() ?? "[]") as Record<string, unknown> | Record<string, unknown>[];
      const items = Array.isArray(body) ? body : [body];
      if (table === "readings") {
        for (const item of items) {
          const refusal = this.checkReading(item);
          if (refusal) return json(refusal.status, refusal.body);
        }
      }
      if (table === "course_documents" || table === "course_document_chunks" || table === "document_chapters" || table === "document_extracts") {
        const refusal =
          table === "course_documents"
            ? this.checkNewDocument(items[0])
            : table === "course_document_chunks"
              ? this.checkChunk(items[0])
              : table === "document_chapters"
                ? this.checkChapter(items[0])
                : this.checkExtract(items[0]);
        if (refusal) return json(refusal.status, refusal.body);
      }
      const stored = items.map((item): Row => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "not_started",
        completed_at: null,
        ...(table === "course_documents" ? { status: "uploading", uploaded_bytes: 0, progress: 0, error: null, page_count: null, page_offset: 0 } : {}),
        ...(table === "document_extracts" ? { status: "pending", error: null, size_bytes: null } : {}),
        ...item,
        // whatever a signed-in user sends, the database records their chapters as manual
        ...(table === "document_chapters" ? { source: "manual" } : {}),
      }));
      if (table === "course_document_chunks") {
        // keep only what the checks need (the bytes themselves would just fill memory)
        for (const chunk of stored) {
          const doc = this.db.course_documents.find((d) => d.id === chunk.document_id);
          if (doc) doc.uploaded_bytes = Number(doc.uploaded_bytes) + this.hexBytes(chunk.data);
          chunk.data = "";
        }
      }
      this.db[table].push(...stored);
      if (table === "document_extracts") this.simulateExtract(stored[0]);
      this.writes.push({ table, method, body: items });
      const wantsBody = (request.headers()["prefer"] ?? "").includes("return=representation");
      // Like PostgREST: a single object when the client asked for one (supabase-js .single()), else an array.
      const asObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      return wantsBody
        ? json(201, asObject ? this.withRelations(stored[0]) : stored.map((r) => this.withRelations(r)))
        : route.fulfill({ status: 201, headers: cors, body: "" });
    }

    if (method === "PATCH") {
      const patch = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      this.writes.push({ table, method, body: [patch] });
      if (this.patchDelayMs) await new Promise((resolve) => setTimeout(resolve, this.patchDelayMs));
      if (this.failPatches) return json(500, { code: "XX000", message: "boom", details: "", hint: null });
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const row = this.db[table].find((r) => r.id === id);
      if (row && table === "course_documents" && patch.status !== undefined && patch.status !== row.status) {
        const refusal = this.checkQueue(row, String(patch.status));
        if (refusal) return json(400, refusal);
        this.simulateWorker(row);
      }
      if (row && table === "document_chapters") {
        const refusal = this.checkChapter(patch, row);
        if (refusal) return json(refusal.status, refusal.body);
        Object.assign(row, patch, { source: "manual" }); // recorded as the user's own, whatever they send
        return route.fulfill({ status: 204, headers: cors });
      }
      if (row) Object.assign(row, patch);
      return route.fulfill({ status: 204, headers: cors });
    }

    if (method === "DELETE") {
      this.writes.push({ table, method, body: [] });
      const id = url.searchParams.get("id")?.replace("eq.", "");
      this.db[table] = this.db[table].filter((r) => r.id !== id);
      if (table === "course_documents") {
        // ON DELETE CASCADE
        this.db.course_document_chunks = this.db.course_document_chunks.filter((c) => c.document_id !== id);
        this.db.document_pages = this.db.document_pages.filter((p) => p.document_id !== id);
        this.db.document_chapters = this.db.document_chapters.filter((c) => c.document_id !== id);
        this.db.document_extracts = this.db.document_extracts.filter((e) => e.document_id !== id);
        // readings.document_id is ON DELETE SET NULL: the reading stays, without its download
        for (const reading of this.db.readings) if (reading.document_id === id) reading.document_id = null;
      }
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
