/**
 * GIA — Daily Morning Briefing Edge Function
 *
 * Sends a concise dark HTML email at 9 am ET (13:00 UTC) to Agency tier users
 * who had at least one alert fire in the past 24 hours.
 * Quiet days = no email sent. No noise.
 *
 * Environment variables:
 *   SUPABASE_URL               (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 *   RESEND_API_KEY             shared — already set
 *   DIGEST_FROM_EMAIL_GIA      agency@skylandapps.com — already set
 *
 * Schedule: cron '0 13 * * *' via migration 20260709000004_gia_morning_briefing_cron.sql
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface AlertRow {
  mission_id: string;
  message: string;
  triggered_at: string;
}

interface MissionRow {
  id: string;
  codename: string;
  watch_type: string;
  target: string;
}

function buildBriefingEmail(
  userEmail: string,
  alerts: AlertRow[],
  missions: MissionRow[]
): string {
  const missionMap: Record<string, MissionRow> = {};
  for (const m of missions) missionMap[m.id] = m;

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const rows = alerts
    .map((a) => {
      const m = missionMap[a.mission_id];
      const time = new Date(a.triggered_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
      return `
        <tr style="border-bottom:1px solid #1a2a20;">
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#f5f0e8;">
            🔔 ${m?.codename ?? "Unknown"}
          </td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#888;text-transform:uppercase;">
            ${m?.watch_type?.replace("_", " ") ?? ""}
          </td>
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#c0c0c0;">
            ${a.message}
          </td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#555;white-space:nowrap;">
            ${time} ET
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>GIA Morning Briefing</title>
</head>
<body style="margin:0;padding:0;background:#080a0c;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080a0c;padding:40px 20px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:24px;border-bottom:1px solid #1a2a20;">
            <p style="margin:0 0 6px;font-family:monospace;font-size:10px;color:#1a4a2a;letter-spacing:0.3em;text-transform:uppercase;">
              ■ MORNING BRIEFING · ENCRYPTED
            </p>
            <h1 style="margin:0;font-family:monospace;font-size:18px;font-weight:700;color:#f5f0e8;letter-spacing:0.05em;">
              GO INTELLIGENCE AGENCY
            </h1>
          </td>
        </tr>

        <tr><td style="height:20px;"></td></tr>

        <!-- Summary -->
        <tr>
          <td>
            <p style="margin:0 0 4px;font-family:monospace;font-size:10px;color:#555;letter-spacing:0.25em;text-transform:uppercase;">
              ${dateLabel}
            </p>
            <p style="margin:0 0 20px;font-size:15px;color:#f5f0e8;font-weight:600;">
              ${alerts.length} alert${alerts.length !== 1 ? "s" : ""} fired in the last 24 hours.
            </p>
          </td>
        </tr>

        <!-- Alert table -->
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#0d1117;border:1px solid #1a3325;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#0a1510;border-bottom:1px solid #1a3325;">
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Operative</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Type</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Alert</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Time</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </td>
        </tr>

        <tr><td style="height:28px;"></td></tr>

        <!-- CTA -->
        <tr>
          <td align="center">
            <a href="https://go-i-agency.com"
              style="display:inline-block;background:#065f46;color:#ffffff;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:12px 28px;border-radius:4px;">
              Open The Agency →
            </a>
          </td>
        </tr>

        <tr><td style="height:32px;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #111;padding-top:16px;">
            <p style="margin:0;font-family:monospace;font-size:10px;color:#333;letter-spacing:0.1em;">
              GIA Morning Briefing · Agency Tier · Sent to ${userEmail}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (authHeader !== `Bearer ${serviceKey}` && Deno.env.get("DENO_DEPLOYMENT_ID")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("DIGEST_FROM_EMAIL_GIA") ?? "agency@skylandapps.com";

  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Agency tier users who had alerts in the last 24h
  const { data: agencyProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("tier", "agency");

  if (!agencyProfiles || agencyProfiles.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: "No Agency tier users" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const results: { userId: string; status: string; error?: string }[] = [];

  for (const profile of agencyProfiles) {
    try {
      // Get alerts from last 24h
      const { data: alerts } = await supabase
        .from("secret_agent_alerts")
        .select("mission_id, message, triggered_at")
        .eq("user_id", profile.id)
        .eq("alert_type", "condition_met")
        .gte("triggered_at", since)
        .order("triggered_at", { ascending: false });

      // Skip if no alerts — quiet day, no email
      if (!alerts || alerts.length === 0) {
        results.push({ userId: profile.id, status: "skip_quiet" });
        continue;
      }

      // Get user email
      const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
      if (!userData?.user?.email) {
        results.push({ userId: profile.id, status: "skip_no_email" });
        continue;
      }
      const userEmail = userData.user.email;

      // Get missions referenced in the alerts
      const missionIds = [...new Set(alerts.map((a: AlertRow) => a.mission_id))];
      const { data: missions } = await supabase
        .from("secret_agent_missions")
        .select("id, codename, watch_type, target")
        .in("id", missionIds);

      const html = buildBriefingEmail(
        userEmail,
        alerts as AlertRow[],
        (missions ?? []) as MissionRow[]
      );

      const now = new Date();
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Go Intelligence Agency <${fromEmail}>`,
          to: [userEmail],
          subject: `GIA Morning Briefing — ${alerts.length} alert${alerts.length !== 1 ? "s" : ""} · ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          html,
        }),
      });

      if (sendRes.ok) {
        results.push({ userId: profile.id, status: "sent" });
      } else {
        const errText = await sendRes.text();
        results.push({ userId: profile.id, status: "resend_error", error: errText });
      }
    } catch (err: unknown) {
      results.push({
        userId: profile.id,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  return new Response(
    JSON.stringify({ sent, total: agencyProfiles.length, results }),
    { headers: { "Content-Type": "application/json" } }
  );
});
