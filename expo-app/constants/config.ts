// `.trim()` every EXPO_PUBLIC secret at read time. Pasted values frequently
// carry a trailing "\n" (e.g. NODE_ENV="development\n"), and an invisible
// newline silently corrupts the JWT `audience`/URL parsing → dead auth with no
// error surfaced. Zero-cost, kills the whole class (CampoVivo SIWA incident).
export const Config = {
  SUPABASE_URL: (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  STRIPE_PUBLISHABLE_KEY: (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').trim(),
  GOOGLE_CLIENT_ID: (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '').trim(),
  // CLAUDE_API_KEY and RESEND_API_KEY removed - these are server-side only secrets
  // CLAUDE_API_KEY is now in Supabase Edge Function env (ai-chat)
  // RESEND_API_KEY is server-side only
};
