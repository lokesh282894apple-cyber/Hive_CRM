#!/usr/bin/env node
/**
 * One-time helper: obtain a Google OAuth refresh token for the shared
 * Hive admissions calendar account.
 *
 * Prerequisites:
 * 1. Google Cloud project with Calendar API enabled
 * 2. OAuth client (Desktop app or Web) — copy Client ID + Secret
 * 3. Add http://127.0.0.1:53682/callback as an authorized redirect URI
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google:oauth
 *
 * Sign in as admissions@yourdomain (the shared calendar owner), then paste
 * GOOGLE_REFRESH_TOKEN into .env.local.
 */

import http from "http";
import { URL } from "url";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = encodeURIComponent(
  "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"
);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.");
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_type=code` +
  `&scope=${SCOPE}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    if (u.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = u.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }

    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await tokenRes.json();

    if (!tokenRes.ok) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Token error: ${JSON.stringify(json)}`);
      console.error(json);
      server.close();
      process.exit(1);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><body style="font-family:system-ui;padding:2rem"><h1>Connected</h1><p>You can close this tab and return to the terminal.</p></body></html>`
    );

    console.log("\nAdd these to .env.local:\n");
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${json.refresh_token || "(none — revoke app access and retry with prompt=consent)"}`);
    console.log(`GOOGLE_CALENDAR_ID=primary`);
    console.log(`GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata\n`);
    if (!json.refresh_token) {
      console.warn(
        "No refresh_token returned. In Google Account → Security → Third-party access, remove this app and run again."
      );
    }
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Error");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\nOpen this URL in a browser (sign in as the shared admissions account):\n");
  console.log(authUrl);
  console.log(`\nWaiting for OAuth callback on ${REDIRECT} …\n`);
});
