import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest/send";

export const dynamic = "force-dynamic";

/**
 * The weekly digest run.
 *
 * Authenticated with the same shared secret as the other cron routes. This
 * one matters more than they do: the others burn an API quota if abused,
 * while this one sends mail to real people, so an unauthenticated call is a
 * way to use this deployment to spam its own users.
 *
 * Defaults to a **dry run**. Pass `?send=1` to actually deliver. That is the
 * wrong way round for convenience and the right way round for a route whose
 * mistake is irreversible — an email cannot be recalled, and the failure mode
 * of "curl it to see what it does" should not be a mailshot.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Without a secret this endpoint is open to the internet. The other cron
    // routes tolerate that because the worst case is a wasted API call; here
    // the worst case is unsolicited mail sent in the operator's name.
    return NextResponse.json(
      {
        error: "CRON_SECRET is not set",
        message:
          "The digest sends email, so it refuses to run unauthenticated. Set CRON_SECRET " +
          "and call this route with an Authorization: Bearer header.",
      },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const send = params.get("send") === "1";
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : undefined;

  try {
    const result = await runDigest({ dryRun: !send, limit });
    return NextResponse.json(
      {
        ...result,
        note: send
          ? "Live run. Recipients past their gap with something to report were emailed."
          : "Dry run — nothing was sent. Add ?send=1 to deliver.",
      },
      { status: result.ok ? 200 : 503 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Digest run failed";
    return NextResponse.json({ ok: false, error: "digest-failed", message }, { status: 500 });
  }
}
