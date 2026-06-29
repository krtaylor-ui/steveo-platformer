const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const noSessionOpts = { auth: { persistSession: false, autoRefreshToken: false } };

// DB-only client — service role key, never has a user session set on it
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, noSessionOpts);

// Auth client — used for signIn/signUp/signOut/getUser; session is set here temporarily
const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, noSessionOpts);

module.exports = { supabaseAdmin, supabaseAuth };
