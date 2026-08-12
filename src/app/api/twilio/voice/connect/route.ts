import { NextRequest, NextResponse } from "next/server";

/**
 * After counselor answers, dial the lead and bridge the call.
 * Twilio POSTs here with Digits etc. — we only need leadPhone from query.
 */
export async function POST(req: NextRequest) {
  const leadPhone = req.nextUrl.searchParams.get("leadPhone");
  if (!leadPhone) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Missing lead phone.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi">Connecting you to the lead now.</Say>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER ?? ""}">${escapeXml(
    leadPhone
  )}</Dial>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
