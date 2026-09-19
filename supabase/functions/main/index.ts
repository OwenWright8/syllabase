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

console.log("main function router started");

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const serviceName = pathParts[1];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
    const message = e instanceof Error ? e.toString() : String(e);
    return new Response(JSON.stringify({ msg: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
