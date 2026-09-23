import { google } from "googleapis";
import { randomUUID } from "crypto";
import "server-only";

export type InterviewMeetInput = {
  requestId: string;
  summary: string;
  description?: string;
  startDateTime: string; // ISO local or offset
  endDateTime: string;
  attendeeEmails: string[];
  /** Also write a copy onto this panelist's Google calendar when permitted */
  panelistCalendarEmail?: string | null;
  timeZone?: string;
};

export type InterviewMeetResult = {
  meetLink: string | null;
  eventId: string;
  panelistEventId: string | null;
};

let warnedMissingConfig = false;

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

function timeZone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Kolkata";
}

function getCalendarClient() {
  if (!isGoogleCalendarConfigured()) {
    if (!warnedMissingConfig) {
      console.warn(
        "[google-calendar] Not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
      );
      warnedMissingConfig = true;
    }
    return null;
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

function extractMeetLink(event: {
  hangoutLink?: string | null;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }>;
  } | null;
}): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video" && e.uri
  );
  return video?.uri ?? null;
}

/** Build ISO-like datetime from date (yyyy-MM-dd) + time (HH:mm or HH:mm:ss). */
export function slotDateTime(date: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return `${date}T${t}`;
}

export async function createInterviewMeetEvent(
  input: InterviewMeetInput
): Promise<InterviewMeetResult | null> {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  const tz = input.timeZone || timeZone();
  const attendees = Array.from(
    new Set(
      input.attendeeEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  ).map((email) => ({ email }));

  const { data } = await calendar.events.insert({
    calendarId: calendarId(),
    conferenceDataVersion: 1,
    sendUpdates: attendees.length ? "all" : "none",
    requestBody: {
      summary: input.summary,
      description: input.description ?? undefined,
      start: { dateTime: input.startDateTime, timeZone: tz },
      end: { dateTime: input.endDateTime, timeZone: tz },
      attendees: attendees.length ? attendees : undefined,
      conferenceData: {
        createRequest: {
          requestId: input.requestId || randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  if (!data.id) {
    throw new Error("Google Calendar did not return an event id");
  }

  const meetLink = extractMeetLink(data);
  let panelistEventId: string | null = null;
  const panelistEmail = input.panelistCalendarEmail?.trim().toLowerCase();
  if (panelistEmail && panelistEmail.includes("@")) {
    try {
      const copy = await calendar.events.insert({
        calendarId: panelistEmail,
        sendUpdates: "none",
        requestBody: {
          summary: input.summary,
          description: [
            input.description,
            meetLink ? `Meet: ${meetLink}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          start: { dateTime: input.startDateTime, timeZone: tz },
          end: { dateTime: input.endDateTime, timeZone: tz },
          attendees,
        },
      });
      panelistEventId = copy.data.id ?? null;
    } catch (err) {
      // Workspace may not allow writing other users' calendars — shared calendar + invite still works
      console.warn(
        "[google-calendar] panelist calendar write skipped:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    eventId: data.id,
    meetLink,
    panelistEventId,
  };
}

export async function deleteInterviewMeetEvent(
  eventId: string | null | undefined,
  panelistEventId?: string | null,
  panelistCalendarEmail?: string | null
): Promise<void> {
  if (!eventId || eventId.startsWith("stub-")) {
    // still try panelist cleanup below
  } else {
    const calendar = getCalendarClient();
    if (calendar) {
      try {
        await calendar.events.delete({
          calendarId: calendarId(),
          eventId,
          sendUpdates: "all",
        });
      } catch (err) {
        console.warn("[google-calendar] delete failed:", err);
      }
    }
  }

  if (panelistEventId && panelistCalendarEmail) {
    const calendar = getCalendarClient();
    if (!calendar) return;
    try {
      await calendar.events.delete({
        calendarId: panelistCalendarEmail.trim().toLowerCase(),
        eventId: panelistEventId,
        sendUpdates: "none",
      });
    } catch (err) {
      console.warn("[google-calendar] panelist delete failed:", err);
    }
  }
}
