// -----------------------------------------------------------------------------
// WhatsApp share utility — Sentry RUMO-PRAGAS-5 fix (2026-05-20)
// -----------------------------------------------------------------------------
// `Linking.openURL('whatsapp://send?text=...')` throws "Unable to open URL"
// when:
//   - WhatsApp is not installed
//   - iOS 17+ blocks the scheme because it isn't declared in
//     LSApplicationQueriesSchemes (canOpenURL silently returns false)
//   - Android scoped URL is blocked by package visibility (Android 11+)
//
// This util tries the native scheme first (best UX — opens the WhatsApp app
// directly with pre-filled text) and falls back to https://wa.me which opens
// in any browser and chains to the WhatsApp web/desktop/mobile client. The
// wa.me URL is HTTPS, so it cannot throw "Unable to open URL" the same way.
//
// Errors are reported via the existing sentry-shim (NOT direct
// @sentry/react-native — see sentry-shim.ts for rationale). The function NEVER
// throws — it always returns a discriminated union so the caller can show a
// friendly toast/alert.
// -----------------------------------------------------------------------------

import * as Linking from 'expo-linking';
import { addBreadcrumb, captureException } from './sentry-shim';

export type WhatsAppShareResult =
  | { ok: true; via: 'native' | 'web' }
  | { ok: false; reason: 'no_whatsapp' | 'unknown'; error?: unknown };

export type WhatsAppShareInput = {
  /** Message body. Will be URI-encoded internally. */
  text: string;
  /**
   * Optional phone number in international format WITHOUT '+' (e.g. '5511999999999').
   * If omitted, the native picker / wa.me lets the user pick a contact.
   */
  phone?: string;
};

/**
 * Open WhatsApp with a pre-filled message.
 *
 * Strategy:
 *   1. Try `whatsapp://send` (native deep link — best UX).
 *   2. If `canOpenURL` returns false OR `openURL` throws, fall back to
 *      `https://wa.me/...` (works without LSApplicationQueriesSchemes,
 *      works without WhatsApp installed — opens browser → web/desktop).
 *   3. If both fail (e.g. no browser, airplane mode), capture to Sentry and
 *      return `{ ok: false, reason: 'no_whatsapp' }`.
 *
 * The function NEVER throws. Always returns a discriminated union.
 */
export async function shareToWhatsApp(input: WhatsAppShareInput): Promise<WhatsAppShareResult> {
  const { text, phone } = input;
  const encoded = encodeURIComponent(text);
  const nativeUrl = phone
    ? `whatsapp://send?phone=${phone}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`;
  const webUrl = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  // Step 1 — try native scheme.
  try {
    const canOpenNative = await Linking.canOpenURL(nativeUrl);
    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
      return { ok: true, via: 'native' };
    }
    addBreadcrumb({
      category: 'share',
      level: 'info',
      message: 'whatsapp canOpenURL=false, falling back to wa.me',
      data: { hasPhone: Boolean(phone) },
    });
  } catch (err) {
    // canOpenURL or openURL threw — most commonly the iOS 17+ "Unable to
    // open URL" error captured in Sentry RUMO-PRAGAS-5.
    addBreadcrumb({
      category: 'share',
      level: 'info',
      message: 'whatsapp native openURL threw, falling back to wa.me',
      data: { error: String(err), hasPhone: Boolean(phone) },
    });
  }

  // Step 2 — fall back to wa.me (HTTPS — always openable in any browser).
  try {
    await Linking.openURL(webUrl);
    return { ok: true, via: 'web' };
  } catch (err) {
    captureException(err, {
      tags: { feature: 'share', target: 'whatsapp' },
      extra: {
        triedNative: nativeUrl,
        triedWebDomain: 'wa.me',
        hasPhone: Boolean(phone),
      },
    });
    return { ok: false, reason: 'no_whatsapp', error: err };
  }
}
