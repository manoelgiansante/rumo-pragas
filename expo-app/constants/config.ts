export const Config = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  GOOGLE_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  // CLAUDE_API_KEY and RESEND_API_KEY removed - these are server-side only secrets
  // CLAUDE_API_KEY is now in Supabase Edge Function env (ai-chat)
  // RESEND_API_KEY is server-side only
};
