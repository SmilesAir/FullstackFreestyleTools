import { getCurrentUserAccess } from "@/lib/authz";
import { getRoutineStartData } from "@/lib/head-judge-queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The running routine's start and every judge's notes on it, for the Head
// Judge's Adjust Start tool to poll. /api isn't covered by the proxy matcher,
// so the permission is checked here.
export async function GET(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access)
    return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!access.isAdmin && !access.permissions.has("head_judge")) {
    return Response.json({ error: "No access" }, { status: 403 });
  }

  const eventId = new URL(request.url).searchParams.get("event");
  if (!eventId || !UUID.test(eventId))
    return Response.json(
      { error: "Missing or invalid event" },
      { status: 400 },
    );

  try {
    return Response.json(await getRoutineStartData(eventId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The database being unreachable.
    return Response.json(
      { error: "Could not read the notes" },
      { status: 500 },
    );
  }
}
