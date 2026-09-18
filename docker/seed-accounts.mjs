// Creates/updates the accounts listed in ACCOUNTS against GoTrue's admin
// API. This is the entire "auth system" for this self-hosted app: there is
// no public signup, and a password "reset" is just editing accounts.env
// and re-running this (which happens automatically on every
// `docker compose up`, since this service runs before `frontend` starts).
//
// ACCOUNTS format: "username:password,username2:password2"
// Each username becomes the GoTrue user "<username>@accounts.local" —
// GoTrue is email-shaped internally, but the app's UI only ever shows
// "Username".

const GOTRUE_URL = process.env.GOTRUE_URL ?? "http://auth:9999";
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const ACCOUNTS = process.env.ACCOUNTS ?? "";
const ACCOUNT_EMAIL_DOMAIN = "accounts.local";

if (!SERVICE_ROLE_KEY) {
  console.error("SERVICE_ROLE_KEY is required");
  process.exit(1);
}

function parseAccounts(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx === -1) {
        throw new Error(`Malformed ACCOUNTS entry (expected username:password): "${entry}"`);
      }
      return { username: entry.slice(0, idx).trim(), password: entry.slice(idx + 1) };
    });
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`${GOTRUE_URL}/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function findUserByEmail(email) {
  // GoTrue's admin list endpoint is paginated rather than filterable by
  // email directly across all versions, so page through and match
  // client-side — fine at the scale this is meant for (a handful of
  // self-hoster-defined accounts, not open registration).
  let page = 1;
  for (;;) {
    const { ok, body } = await adminFetch(`/users?page=${page}&per_page=200`);
    if (!ok) return null;
    const users = body.users ?? [];
    const match = users.find((u) => u.email === email);
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
  }
}

async function waitForGoTrue(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${GOTRUE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Timed out waiting for GoTrue to become healthy");
}

async function upsertAccount({ username, password }) {
  const email = `${username.toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;

  const created = await adminFetch("/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (created.ok) {
    console.log(`created  ${username}`);
    return;
  }

  const existing = await findUserByEmail(email);
  if (!existing) {
    console.error(`FAILED   ${username}: could not create (${created.status}) and no existing account found`);
    process.exitCode = 1;
    return;
  }

  const updated = await adminFetch(`/users/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });

  if (updated.ok) {
    console.log(`updated  ${username} (password reset)`);
  } else {
    console.error(`FAILED   ${username}: password update failed (${updated.status})`);
    process.exitCode = 1;
  }
}

async function main() {
  const accounts = parseAccounts(ACCOUNTS);
  if (accounts.length === 0) {
    console.warn("No ACCOUNTS configured — set ACCOUNTS in accounts.env (username:password,...)");
    return;
  }

  await waitForGoTrue();

  for (const account of accounts) {
    await upsertAccount(account);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
