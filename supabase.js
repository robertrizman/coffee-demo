import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zdgmqmamohrybxwhgwby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZ21xbWFtb2hyeWJ4d2hnd2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzUyODgsImV4cCI6MjA5MDk1MTI4OH0.imhhaa0OBB69u_igWA52b1Hx0Hhyv4do6YLENifAXRo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: fetch.bind(globalThis),
  },
});
