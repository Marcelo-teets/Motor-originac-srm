export const env = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  useSupabase: process.env.USE_SUPABASE === 'true',
  bootstrapSupabase: process.env.BOOTSTRAP_SUPABASE === 'true',
};
