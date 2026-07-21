/**
 * Secret Agent / GIA — Mission Watcher Edge Function
 *
 * Scheduled hourly via pg_cron (see migration 20260522190001).
 * Can also be called directly by admins or during development.
 *
 * For each active mission due for a check, this function:
 *   1. Fetches the current value from the data source
 *   2. Evaluates the user's condition
 *   3. Fires web push (per-mission notify_push) + records an alert
 *   4. Updates last_checked_at, last_value, and status_message on the mission row
 *
 * Environment variables required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               (auto-injected by Supabase runtime)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-injected by Supabase runtime)
 *   WEB-PUSH_PUBLIC_KEY        VAPID public key
 *   WEB_PUSH_PRIVATE_KEY       VAPID private key
 *   WEB_PUSH_CONTACT-EMAIL     mailto: contact for VAPID
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── WMO Weather Code descriptions ───────────────────────────────────────────
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  77: "Snow grains",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

// WMO codes that constitute "severe" weather
const SEVERE_WMO = new Set([45, 48, 65, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

// ─── Data source fetchers ─────────────────────────────────────────────────────

async function fetchWeather(target: string, metadata: Record<string, unknown>): Promise<{
  wmoCode: number;
  description: string;
  isSevere: boolean;
  lat: number;
  lon: number;
}> {
  let lat = metadata.lat as number | undefined;
  let lon = metadata.lon as number | undefined;

  if (!lat || !lon) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(target)}&count=1&language=en&format=json`
    );
    const geoData = await geoRes.json();
    const result = geoData.results?.[0];
    if (!result) throw new Error(`Could not geocode location: "${target}"`);
    lat = result.latitude;
    lon = result.longitude;
  }

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`
  );
  const weatherData = await weatherRes.json();
  const wmoCode: number = weatherData.current_weather?.weathercode ?? 0;

  return {
    wmoCode,
    description: WMO[wmoCode] ?? `Code ${wmoCode}`,
    isSevere: SEVERE_WMO.has(wmoCode),
    lat: lat!,
    lon: lon!,
  };
}

async function fetchSalePrice(url: string): Promise<{ price: number; rawText: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SecretAgent-Watcher/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();

  // Try structured data first (most reliable)
  const ldJson = html.match(/"price"\s*:\s*"?([\d.,]+)"?/);
  if (ldJson) {
    const price = parseFloat(ldJson[1].replace(/,/g, ""));
    if (!isNaN(price)) return { price, rawText: ldJson[0] };
  }

  // Meta tags (OpenGraph price)
  const metaPrice = html.match(/property="product:price:amount"\s+content="([\d.,]+)"/);
  if (metaPrice) {
    const price = parseFloat(metaPrice[1].replace(/,/g, ""));
    if (!isNaN(price)) return { price, rawText: metaPrice[0] };
  }

  // Common price HTML patterns
  const pricePatterns = [
    /class="[^"]*price[^"]*"[^>]*>\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /data-price="([\d.]+)"/i,
    /itemprop="price"[^>]*content="([\d.]+)"/i,
    /\$\s*([\d,]+\.\d{2})\b/,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(price) && price > 0) return { price, rawText: match[0] };
    }
  }

  throw new Error("Could not parse a price from the page");
}

// ─── Crypto (CoinGecko, no key) ──────────────────────────────────────────────

async function fetchCryptoPrice(symbol: string): Promise<{ price: number; name: string }> {
  // Map common tickers to CoinGecko IDs
  const TICKER_TO_ID: Record<string, string> = {
    btc: "bitcoin", bitcoin: "bitcoin",
    eth: "ethereum", ethereum: "ethereum",
    sol: "solana", solana: "solana",
    ada: "cardano", cardano: "cardano",
    xrp: "ripple", ripple: "ripple",
    doge: "dogecoin", dogecoin: "dogecoin",
    matic: "matic-network", polygon: "matic-network",
    dot: "polkadot", polkadot: "polkadot",
    link: "chainlink", chainlink: "chainlink",
    avax: "avalanche-2", avalanche: "avalanche-2",
  };
  const id = TICKER_TO_ID[symbol.toLowerCase().trim()] ?? symbol.toLowerCase().trim();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = await res.json();
  const price = json[id]?.usd;
  if (typeof price !== "number") throw new Error(`Unknown crypto: "${symbol}"`);
  return { price, name: id };
}

// ─── Earthquakes (USGS, no key) ──────────────────────────────────────────────

async function fetchEarthquake(target: string): Promise<{
  magnitude: number;
  place: string;
  count: number;
}> {
  // USGS feeds: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
  // Returns all quakes in the past 24h. We filter for nearest match to target.
  const url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const json = await res.json();

  const targetLower = target.toLowerCase();
  const matches = (json.features ?? []).filter(
    (f: { properties: { place: string } }) =>
      f.properties.place?.toLowerCase().includes(targetLower)
  );

  if (matches.length === 0) {
    return { magnitude: 0, place: target, count: 0 };
  }

  // Largest magnitude in the matches
  const largest = matches.reduce((max: { properties: { mag: number } }, q: { properties: { mag: number } }) =>
    (q.properties.mag ?? 0) > (max.properties.mag ?? 0) ? q : max);

  return {
    magnitude: largest.properties.mag ?? 0,
    place: largest.properties.place ?? target,
    count: matches.length,
  };
}

// ─── Air Quality (Open-Meteo, no key) ────────────────────────────────────────

async function fetchAirQuality(target: string, metadata: Record<string, unknown>): Promise<{
  aqi: number;
  lat: number;
  lon: number;
}> {
  let lat = metadata.lat as number | undefined;
  let lon = metadata.lon as number | undefined;

  if (!lat || !lon) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(target)}&count=1&format=json`
    );
    const geoData = await geoRes.json();
    const result = geoData.results?.[0];
    if (!result) throw new Error(`Could not geocode: "${target}"`);
    lat = result.latitude;
    lon = result.longitude;
  }

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo AQI HTTP ${res.status}`);
  const json = await res.json();
  const hours: number[] = json.hourly?.us_aqi ?? [];
  const now = new Date();
  const idx = Math.min(hours.length - 1, now.getUTCHours());
  const aqi = hours[idx];
  if (typeof aqi !== "number") throw new Error("AQI not available");
  return { aqi, lat: lat!, lon: lon! };
}

// ─── Website Change (HTML hash diff, no key) ─────────────────────────────────

async function fetchWebsiteHash(url: string): Promise<{ hash: string; size: number }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SecretAgent/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();

  // Strip dynamic noise (timestamps, csrf tokens) before hashing
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "");

  const buf = new TextEncoder().encode(stripped);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hash, size: stripped.length };
}

// ─── RSS Feed (no key) ───────────────────────────────────────────────────────

async function fetchRssLatest(url: string): Promise<{
  latestId: string;
  title: string;
  link: string;
}> {
  const res = await fetch(url, {
    headers: { "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml" },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();

  // Try RSS first, fall back to Atom
  const rssItem = xml.match(/<item[\s\S]*?<\/item>/i);
  const atomEntry = xml.match(/<entry[\s\S]*?<\/entry>/i);
  const block = rssItem?.[0] ?? atomEntry?.[0];
  if (!block) throw new Error("No items found in feed");

  const guid = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1]
    ?? block.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1]
    ?? block.match(/<link[^>]*href="([^"]+)"/i)?.[1]
    ?? block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
    ?? "";

  const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    .replace(/<!\[CDATA\[|\]\]>/g, "") ?? "Untitled";

  const link = block.match(/<link[^>]*href="([^"]+)"/i)?.[1]
    ?? block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim()
    ?? "";

  return { latestId: guid.trim(), title, link };
}

// ─── News (Currents API — needs CURRENTS_API_KEY) ────────────────────────────
// Free tier: 600–1000 req/day, commercial-friendly.
// Builder plan: $69/mo for 75k/month if you outgrow free.
// Docs: https://currentsapi.services/

async function fetchNewsKeyword(keyword: string, since: string | null): Promise<{
  count: number;
  latestTitle: string;
  latestUrl: string;
  latestPublishedAt: string;
}> {
  const key = Deno.env.get("CURRENTS_API_KEY");
  if (!key) throw new Error("CURRENTS_API_KEY not configured (currentsapi.services)");

  // Currents API uses "start_date" in ISO 8601 format
  const startParam = since ? `&start_date=${encodeURIComponent(since)}` : "";
  const url = `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(keyword)}&language=en&page_size=5${startParam}&apiKey=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Currents API HTTP ${res.status}`);
  const json = await res.json();

  if (json.status !== "ok") {
    throw new Error(`Currents API error: ${json.status ?? "unknown"}`);
  }

  const articles = (json.news ?? []) as Array<{
    title?: string;
    url?: string;
    published?: string;
  }>;

  return {
    count: articles.length,
    latestTitle: articles[0]?.title ?? "",
    latestUrl: articles[0]?.url ?? "",
    latestPublishedAt: articles[0]?.published ?? "",
  };
}

async function fetchBankBalance(
  userId: string,
  target: string
): Promise<{ balance: number; accountName: string }> {
  // Reads from the shared My$ / Plaid accounts table in the same Supabase project.
  // The query strategy tries to match the target label to account type or name.
  const isChecking = /check/i.test(target);
  const isSavings = /sav/i.test(target);

  let query = supabase
    .from("plaid_accounts")
    .select("name, current_balance, account_type")
    .eq("user_id", userId)
    .order("last_updated_at", { ascending: false })
    .limit(1);

  if (isChecking) query = query.eq("account_type", "checking");
  else if (isSavings) query = query.eq("account_type", "savings");

  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("No bank account data found in shared Plaid table");
  return { balance: data.current_balance, accountName: data.name };
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evaluateCondition(
  operator: string | null,
  threshold: number | null,
  currentValue: number
): boolean {
  if (!operator) return false;
  switch (operator) {
    case "below": return threshold !== null && currentValue < threshold;
    case "above": return threshold !== null && currentValue > threshold;
    case "equals": return threshold !== null && Math.abs(currentValue - threshold) < 0.01;
    case "changes": return true;
    default: return false;
  }
}

// ─── Push notification ────────────────────────────────────────────────────────

async function sendPushToUser(userId: string, title: string, body: string, url = "/") {
  const vapidPublicKey = Deno.env.get("WEB-PUSH_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("WEB_PUSH_CONTACT-EMAIL") ?? "mailto:admin@example.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys not configured — skipping web push");
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subs, error } = await supabase
    .from("user_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs?.length) return;

  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: "gia-alert",
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired — clean it up
          await supabase.from("user_push_subscriptions").delete().eq("id", sub.id);
        }
        console.error("Push send error:", status, sub.id);
      }
    })
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Allow service role key in Authorization header (cron calls) or anon for dev
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (authHeader !== `Bearer ${serviceKey}` && Deno.env.get("DENO_DEPLOYMENT_ID")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const checkCutoff = new Date(now.getTime() - 55 * 60 * 1000); // 55 min ago

  // Fetch all missions due for a check
  const { data: missions, error: fetchError } = await supabase
    .from("secret_agent_missions")
    .select("*")
    .eq("active", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${checkCutoff.toISOString()}`);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const mission of missions ?? []) {
    let statusMessage = "Standing by...";
    let lastValue: string | null = null;
    let conditionMet = false;
    let alertMessage = "";
    let checkError: string | null = null;
    const metadataUpdate: Record<string, unknown> = { ...(mission.metadata ?? {}) };

    try {
      switch (mission.watch_type) {
        case "severe_weather": {
          const weather = await fetchWeather(mission.target, mission.metadata ?? {});
          metadataUpdate.lat = weather.lat;
          metadataUpdate.lon = weather.lon;
          lastValue = String(weather.wmoCode);
          conditionMet = mission.condition_operator === "above"
            ? weather.isSevere
            : evaluateCondition(mission.condition_operator, mission.condition_value, weather.wmoCode);
          statusMessage = conditionMet
            ? `⚠ ${weather.description} detected at ${mission.target}`
            : `Clear: ${weather.description} at ${mission.target}`;
          alertMessage = `Severe weather at ${mission.target}: ${weather.description}`;
          break;
        }

        case "sale_price": {
          const { price, rawText } = await fetchSalePrice(mission.target);
          lastValue = String(price);
          conditionMet = evaluateCondition(mission.condition_operator, mission.condition_value, price);
          statusMessage = conditionMet
            ? `✓ Price $${price.toFixed(2)} meets condition`
            : `Current price: $${price.toFixed(2)} — watching`;
          alertMessage = `Price alert: $${price.toFixed(2)} — ${mission.condition_text}`;
          metadataUpdate.last_price = price;
          metadataUpdate.raw_text = rawText;
          break;
        }

        case "bank_balance": {
          const { balance, accountName } = await fetchBankBalance(mission.user_id, mission.target);
          lastValue = String(balance);
          conditionMet = evaluateCondition(mission.condition_operator, mission.condition_value, balance);
          statusMessage = conditionMet
            ? `⚠ ${accountName} balance $${balance.toFixed(2)} meets alarm condition`
            : `${accountName}: $${balance.toFixed(2)} — all clear`;
          alertMessage = `Balance alert: ${accountName} is $${balance.toFixed(2)}`;
          break;
        }

        case "stock_price": {
          // Uses the free Yahoo Finance unofficial JSON endpoint (no API key needed)
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mission.target)}?interval=1d&range=1d`;
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SecretAgent/1.0)" },
          });
          const json = await res.json();
          const price: number = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (typeof price !== "number") throw new Error("Could not fetch stock price");
          lastValue = String(price);
          conditionMet = evaluateCondition(mission.condition_operator, mission.condition_value, price);
          statusMessage = conditionMet
            ? `✓ ${mission.target} at $${price.toFixed(2)} meets condition`
            : `${mission.target}: $${price.toFixed(2)} — monitoring`;
          alertMessage = `${mission.target} price alert: $${price.toFixed(2)}`;
          break;
        }

        case "crypto_price": {
          const { price, name } = await fetchCryptoPrice(mission.target);
          lastValue = String(price);
          conditionMet = evaluateCondition(mission.condition_operator, mission.condition_value, price);
          statusMessage = conditionMet
            ? `✓ ${name} at $${price.toLocaleString()} meets condition`
            : `${name}: $${price.toLocaleString()} — watching`;
          alertMessage = `${name} crypto alert: $${price.toLocaleString()}`;
          break;
        }

        case "earthquake": {
          const { magnitude, place, count } = await fetchEarthquake(mission.target);
          lastValue = String(magnitude);
          conditionMet = count > 0 && evaluateCondition(mission.condition_operator, mission.condition_value, magnitude);
          statusMessage = conditionMet
            ? `⚠ M${magnitude.toFixed(1)} earthquake near ${place}`
            : count > 0
              ? `${count} small quake${count !== 1 ? 's' : ''} near ${mission.target} (max M${magnitude.toFixed(1)})`
              : `No seismic activity near ${mission.target}`;
          alertMessage = `Earthquake alert: M${magnitude.toFixed(1)} near ${place}`;
          break;
        }

        case "air_quality": {
          const { aqi, lat, lon } = await fetchAirQuality(mission.target, mission.metadata ?? {});
          metadataUpdate.lat = lat;
          metadataUpdate.lon = lon;
          lastValue = String(aqi);
          conditionMet = evaluateCondition(mission.condition_operator, mission.condition_value, aqi);
          const tier = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for sensitive" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very unhealthy" : "Hazardous";
          statusMessage = conditionMet
            ? `⚠ AQI ${aqi} (${tier}) at ${mission.target}`
            : `AQI ${aqi} (${tier}) at ${mission.target}`;
          alertMessage = `Air quality alert: AQI ${aqi} (${tier}) at ${mission.target}`;
          break;
        }

        case "website_change": {
          const { hash, size } = await fetchWebsiteHash(mission.target);
          lastValue = hash.substring(0, 12);
          const previousHash = (mission.metadata as { last_hash?: string })?.last_hash;
          const changed = !!previousHash && previousHash !== hash;
          metadataUpdate.last_hash = hash;
          metadataUpdate.last_size = size;
          conditionMet = changed;
          statusMessage = !previousHash
            ? `Snapshot captured (${size.toLocaleString()} bytes) — watching for changes`
            : changed
              ? `⚠ Page changed at ${mission.target}`
              : `No changes detected — page stable`;
          alertMessage = `Website change detected: ${mission.target}`;
          break;
        }

        case "rss_feed": {
          const { latestId, title, link } = await fetchRssLatest(mission.target);
          lastValue = latestId.substring(0, 40);
          const previousId = (mission.metadata as { last_item_id?: string })?.last_item_id;
          const isNew = !!previousId && previousId !== latestId;
          metadataUpdate.last_item_id = latestId;
          metadataUpdate.last_title = title;
          metadataUpdate.last_link = link;
          conditionMet = isNew;
          statusMessage = !previousId
            ? `Subscribed — latest: "${title.substring(0, 60)}"`
            : isNew
              ? `⚠ New post: "${title.substring(0, 60)}"`
              : `No new posts — last: "${title.substring(0, 50)}"`;
          alertMessage = `New post in feed: "${title}"`;
          break;
        }

        case "news_keyword": {
          const previousLatest = (mission.metadata as { last_published?: string })?.last_published ?? null;
          const { count, latestTitle, latestUrl, latestPublishedAt } = await fetchNewsKeyword(mission.target, previousLatest);
          lastValue = String(count);
          const isNew = !!previousLatest && !!latestPublishedAt && latestPublishedAt > previousLatest;
          if (latestPublishedAt) metadataUpdate.last_published = latestPublishedAt;
          metadataUpdate.last_title = latestTitle;
          metadataUpdate.last_url = latestUrl;
          conditionMet = isNew || (!previousLatest && count > 0 && mission.condition_operator === "changes");
          statusMessage = !previousLatest
            ? `Tracking "${mission.target}" — ${count} matching articles indexed`
            : isNew
              ? `⚠ New article: "${latestTitle?.substring(0, 60)}"`
              : `No new articles for "${mission.target}"`;
          alertMessage = `News alert "${mission.target}": ${latestTitle}`;
          break;
        }

        default:
          statusMessage = "Unknown mission type";
      }
    } catch (err: unknown) {
      checkError = (err as Error).message;
      statusMessage = `Check error: ${checkError}`;
      console.error(`Mission ${mission.id} check failed:`, checkError);
    }

    // Suppress duplicate alerts — only fire once per alert window (60 min)
    const alertCooldown = new Date(now.getTime() - 60 * 60 * 1000);
    const alreadyAlerted =
      mission.last_alert_sent_at &&
      new Date(mission.last_alert_sent_at) > alertCooldown;

    if (conditionMet && !alreadyAlerted && !checkError) {
      // Fire push notification (gated on per-mission notify_push flag, default true)
      if (mission.notify_push !== false) {
        await sendPushToUser(
          mission.user_id,
          `${mission.codename}`,
          alertMessage,
          `/?mission=${mission.id}`
        );
      }

      // Fire webhook (Agency: optional per-mission URL)
      if (mission.webhook_url) {
        try {
          await fetch(mission.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mission_id: mission.id,
              codename: mission.codename,
              watch_type: mission.watch_type,
              target: mission.target,
              alert_message: alertMessage,
              last_value: lastValue,
              condition_operator: mission.condition_operator,
              condition_value: mission.condition_value,
              triggered_at: now.toISOString(),
            }),
          });
        } catch (webhookErr) {
          console.error("Webhook delivery failed:", mission.webhook_url, (webhookErr as Error).message);
        }
      }

      // Write to app inbox (shared cross-app notification table)
      const { error: inboxErr } = await supabase.from("skyland_app_inbox").insert({
        user_id: mission.user_id,
        app_id: "secret-agent",
        title: mission.codename,
        body: alertMessage,
        mission_id: mission.id,
      });
      if (inboxErr) console.warn("Inbox insert skipped:", inboxErr.message);

      // Log the alert
      await supabase.from("secret_agent_alerts").insert({
        mission_id: mission.id,
        user_id: mission.user_id,
        alert_type: "condition_met",
        message: alertMessage,
        payload: { last_value: lastValue, condition_operator: mission.condition_operator, condition_value: mission.condition_value },
      });
    } else if (!checkError) {
      // Log a check_ok event (throttled — only if last alert log was >6h ago)
      const logCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const lastAlertTime = mission.last_alert_sent_at ? new Date(mission.last_alert_sent_at) : new Date(0);
      if (lastAlertTime < logCutoff) {
        await supabase.from("secret_agent_alerts").insert({
          mission_id: mission.id,
          user_id: mission.user_id,
          alert_type: "check_ok",
          message: statusMessage,
          payload: { last_value: lastValue },
        });
      }
    }

    // Update the mission row
    await supabase
      .from("secret_agent_missions")
      .update({
        last_checked_at: now.toISOString(),
        last_value: lastValue,
        status_message: statusMessage,
        metadata: metadataUpdate,
        ...(conditionMet && !alreadyAlerted ? { last_alert_sent_at: now.toISOString() } : {}),
      })
      .eq("id", mission.id);

    results.push({
      id: mission.id,
      status: checkError ? "error" : conditionMet ? "alert_fired" : "ok",
      ...(checkError ? { error: checkError } : {}),
    });
  }

  return new Response(
    JSON.stringify({ checked: results.length, results, ts: now.toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
