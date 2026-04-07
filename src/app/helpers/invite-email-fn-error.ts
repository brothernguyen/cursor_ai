import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

/**
 * Human-readable message from supabase.functions.invoke() errors (HTTP, network, relay).
 */
export async function messageFromInviteEmailFnError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const text = await res.text();
    let body: {
      error?: string;
      details?: unknown;
      hint?: string;
      smtpError?: string;
      message?: string;
    } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      const head = text.slice(0, 400).toLowerCase();
      if (
        res.status === 502 &&
        (head.includes('<html') ||
          head.includes('<!doctype') ||
          head.includes('bad gateway'))
      ) {
        return (
          `${error.message} (HTTP ${res.status}). ` +
          'Supabase returned an HTML gateway page (the function often timed out or crashed before sending JSON). ' +
          'On hosted Edge Functions, outbound SMTP to ports 25 and 587 is blocked — set SMTP_PORT=465 for Gmail, or use Resend (RESEND_API_KEY). Check Dashboard → Edge Functions → Logs for this function.'
        );
      }
      const clip = text.length > 600 ? `${text.slice(0, 600)}…` : text;
      return clip
        ? `${error.message} (HTTP ${res.status}). Body: ${clip}`
        : `${error.message} (HTTP ${res.status})`;
    }
    let msg =
      typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : error.message;
    if (body.details !== undefined) {
      msg = `${msg}: ${JSON.stringify(body.details)}`;
    }
    if (typeof body.smtpError === 'string') {
      msg = `${msg} (${body.smtpError})`;
    }
    if (typeof body.hint === 'string') {
      msg = `${msg} ${body.hint}`;
    }
    return msg;
  }
  if (error instanceof FunctionsRelayError) {
    return `${error.message} Check that send-company-admin-invite is deployed and healthy.`;
  }
  if (error instanceof FunctionsFetchError) {
    const ctx = error.context as { message?: string; name?: string } | undefined;
    const extra =
      ctx && typeof ctx === 'object' && typeof ctx.message === 'string'
        ? ` ${ctx.message}`
        : '';
    return (
      'Could not reach the invite email service (network error).' +
      extra +
      ' Local dev: use `ng serve` (proxy.conf.json routes /__sb-fn → Supabase). Try another network, disable VPN/ad blockers, or add a same-origin proxy for production.'
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Invitation email failed';
}
