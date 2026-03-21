const hasSupabaseCredentials = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));

export const env = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  useSupabase: process.env.USE_SUPABASE ? process.env.USE_SUPABASE === 'true' : hasSupabaseCredentials,
  bootstrapSupabase: process.env.BOOTSTRAP_SUPABASE === 'true',
};
