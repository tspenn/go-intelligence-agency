/**
 * GIA — Weekly Mission Digest Edge Function
 *
 * Sends a dark-styled HTML email every Sunday night (Monday 02:00 UTC) via Resend
 * to users on the Agency tier (profiles.tier = 'agency').
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 *   RESEND_API_KEY             shared across apps — already set
 *   DIGEST_FROM_EMAIL_GIA      e.g. agency@skylandapps.com — set separately
 *
 * Schedule: cron '0 2 * * 1' via migration 20260709000002_gia_weekly_digest_cron.sql
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MissionRow {
  id: string;
  codename: string;
  watch_type: string;
  target: string;
  active: boolean;
  status_message: string;
  last_checked_at: string | null;
  last_alert_sent_at: string | null;
}

interface AlertRow {
  mission_id: string;
  alert_type: string;
  message: string;
  triggered_at: string;
}

// ─── HTML email builder ───────────────────────────────────────────────────────

function buildDigestEmail(
  userEmail: string,
  missions: MissionRow[],
  recentAlerts: AlertRow[]
): string {
  const now = new Date();
  const weekLabel = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const activeMissions = missions.filter((m) => m.active);
  const alertMissions = activeMissions.filter((m) =>
    m.status_message.startsWith("⚠") || m.status_message.startsWith("✓")
  );
  const quietMissions = activeMissions.filter(
    (m) => !m.status_message.startsWith("⚠") && !m.status_message.startsWith("✓")
  );

  const conditionAlerts = recentAlerts.filter(
    (a) => a.alert_type === "condition_met"
  );

  // Per-mission alert rows
  const missionRows = activeMissions
    .map((m) => {
      const missionAlerts = conditionAlerts.filter(
        (a) => a.mission_id === m.id
      );
      const alertCount = missionAlerts.length;
      const lastAlert = missionAlerts[0]?.triggered_at
        ? new Date(missionAlerts[0].triggered_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "—";
      const statusColor = alertCount > 0 ? "#f59e0b" : "#10b981";
      const statusDot = alertCount > 0 ? "🟡" : "🟢";

      return `
        <tr style="border-bottom:1px solid #1a2a20;">
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#f5f0e8;">${statusDot} ${m.codename}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#888;text-transform:uppercase;">${m.watch_type.replace("_", " ")}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:${statusColor};">${alertCount > 0 ? `${alertCount} alert${alertCount !== 1 ? "s" : ""}` : "Quiet"}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#666;">${lastAlert}</td>
        </tr>`;
    })
    .join("");

  const quietSection =
    quietMissions.length > 0
      ? `<p style="font-family:monospace;font-size:12px;color:#555;margin:0 0 4px;">
          ${quietMissions.map((m) => m.codename).join(" · ")}
         </p>`
      : `<p style="font-family:monospace;font-size:12px;color:#444;margin:0;">All operatives active this week.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>GIA Weekly Briefing</title>
</head>
<body style="margin:0;padding:0;background:#080a0c;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080a0c;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;">
            <p style="margin:0;font-family:monospace;font-size:10px;color:#1a4a2a;letter-spacing:0.3em;text-transform:uppercase;">
              ■ ENCRYPTED CHANNEL ACTIVE
            </p>
            <h1 style="margin:12px 0 4px;font-family:monospace;font-size:22px;font-weight:700;color:#f5f0e8;letter-spacing:0.05em;">
              GO INTELLIGENCE AGENCY
            </h1>
            <p style="margin:0;font-family:monospace;font-size:11px;color:#10b981;letter-spacing:0.2em;text-transform:uppercase;">
              Weekly Operations Briefing
            </p>
          </td>
        </tr>

        <!-- Summary headline -->
        <tr>
          <td style="background:#0d1a12;border:1px solid #1a3325;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-family:monospace;font-size:10px;color:#555;letter-spacing:0.25em;text-transform:uppercase;">
              Week of ${weekLabel}
            </p>
            <p style="margin:0;font-size:16px;color:#f5f0e8;font-weight:600;">
              ${conditionAlerts.length > 0
                ? `${conditionAlerts.length} alert${conditionAlerts.length !== 1 ? "s" : ""} fired across ${alertMissions.length} operative${alertMissions.length !== 1 ? "s" : ""} this week.`
                : `All ${activeMissions.length} operative${activeMissions.length !== 1 ? "s" : ""} ran quietly. No alerts this week.`
              }
            </p>
          </td>
        </tr>

        <tr><td style="height:24px;"></td></tr>

        <!-- Mission table -->
        <tr>
          <td>
            <p style="margin:0 0 12px;font-family:monospace;font-size:10px;color:#10b981;letter-spacing:0.25em;text-transform:uppercase;">
              — Active Operations —
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;border:1px solid #1a3325;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#0a1510;border-bottom:1px solid #1a3325;">
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Operative</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Type</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">This Week</th>
                  <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.2em;">Last Alert</th>
                </tr>
              </thead>
              <tbody>
                ${missionRows || `<tr><td colspan="4" style="padding:16px 12px;font-family:monospace;font-size:12px;color:#444;text-align:center;">No active operatives</td></tr>`}
              </tbody>
            </table>
          </td>
        </tr>

        <tr><td style="height:24px;"></td></tr>

        <!-- Quiet missions -->
        ${quietMissions.length > 0 ? `
        <tr>
          <td style="background:#0a0e10;border:1px solid #1a2a20;border-radius:6px;padding:16px 20px;">
            <p style="margin:0 0 8px;font-family:monospace;font-size:10px;color:#555;letter-spacing:0.25em;text-transform:uppercase;">
              Quiet this week
            </p>
            ${quietSection}
          </td>
        </tr>
        <tr><td style="height:24px;"></td></tr>
        ` : ""}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 0 32px;">
            <a href="https://go-i-agency.com"
               style="display:inline-block;background:#065f46;color:#ffffff;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:4px;">
              Open The Agency →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #111;padding-top:20px;">
            <p style="margin:0 0 4px;font-family:monospace;font-size:10px;color:#333;letter-spacing:0.15em;text-transform:uppercase;">
              Go Intelligence Agency · Encrypted · Agency Tier
            </p>
            <p style="margin:0;font-family:monospace;font-size:10px;color:#333;">
              Sent to ${userEmail}. Manage your account at go-i-agency.com
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

  // Get all Agency-tier user IDs
  const { data: agencyProfiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("tier", "agency");

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!agencyProfiles || agencyProfiles.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: "No Agency tier users found" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const results: { userId: string; status: string; error?: string }[] = [];

  for (const profile of agencyProfiles) {
    try {
      // Get user email via admin API
      const { data: userData, error: userErr } =
        await supabase.auth.admin.getUserById(profile.id);
      if (userErr || !userData?.user?.email) {
        results.push({ userId: profile.id, status: "skip_no_email" });
        continue;
      }
      const userEmail = userData.user.email;

      // Fetch their missions
      const { data: missions } = await supabase
        .from("secret_agent_missions")
        .select("id,codename,watch_type,target,active,status_message,last_checked_at,last_alert_sent_at")
        .eq("user_id", profile.id)
        .eq("active", true)
        .order("created_at", { ascending: false });

      // Fetch recent alerts (last 7 days)
      const { data: recentAlerts } = await supabase
        .from("secret_agent_alerts")
        .select("mission_id,alert_type,message,triggered_at")
        .eq("user_id", profile.id)
        .gte("triggered_at", oneWeekAgo)
        .order("triggered_at", { ascending: false });

      const html = buildDigestEmail(
        userEmail,
        (missions ?? []) as MissionRow[],
        (recentAlerts ?? []) as AlertRow[]
      );

      // Send via Resend
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Go Intelligence Agency <${fromEmail}>`,
          to: [userEmail],
          subject: `Your GIA Weekly Briefing — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
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
