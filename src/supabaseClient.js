import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE (not the default implicit flow) returns the session via a
    // `?code=` query param instead of a `#access_token=` URL fragment,
    // so it doesn't collide with HashRouter's use of the URL hash.
    flowType: 'pkce',
  },
})
