// Required by edge-runtime's `--main-service` mode: it doesn't
// auto-discover a directory of functions on its own — this router is
// the actual entrypoint, dispatching each request to the matching
// function under /app/functions/<name> by spawning a worker isolate per
// request. Adapted (simplified) from Supabase's own self-hosting
// reference (supabase/supabase docker/volumes/functions/main/index.ts).
//
// JWT verification is intentionally NOT done here — each function in
// this app checks its own auth in-code instead (see their individual
// source: test-pushover-notification and delete-user verify a session
// via GoTrue; send-notifications and widget-stats use their own header
// secrets and expect no session at all). A blanket gate here would
// incorrectly block the latter two.

// Only these names are routable. The name comes straight from the request
// URL, so without an allowlist it would be used to build a filesystem path
// (and could point a worker at `main` itself or any other directory under
// /app/functions). Add new functions here as well as under
// supabase/functions/.
const FUNCTIONS = new Set([
  "delete-user",
  "instance-status",
  "send-notifications",
  "test-pushover-notification",
  "widget-stats",
]);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

console.log("main function router started");

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const serviceName = pathParts[1];

  if (!serviceName) {
    return json({ msg: "missing function name in request" }, 400);
  }

  if (!FUNCTIONS.has(serviceName)) {
    return json({ msg: "function not found" }, 404);
  }

  const servicePath = `/app/functions/${serviceName}`;

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60 * 1000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (e) {
    // Log the detail server-side; the client only needs to know it failed.
    console.error(`function "${serviceName}" failed:`, e);
    return json({ msg: "function failed to run" }, 500);
  }
});
