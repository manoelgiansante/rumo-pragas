export const Config = {
  supabaseURL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  toolkitURL: process.env.EXPO_PUBLIC_TOOLKIT_URL || '',
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_KEY || '',
};
