require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function createAdmin() {
  console.log("Creating admin user...");
  
  const { data, error } = await supabase.auth.signUp({
    email: 'admin@pickleball.com',
    password: 'Password123!',
  });

  if (error) {
    console.error("Error creating user:", error.message);
  } else {
    console.log("Success! User created.");
    console.log("Email: admin@pickleball.com");
    console.log("Password: Password123!");
    if (data?.user?.identities?.length === 0) {
      console.log("(Note: User already existed)");
    } else {
      console.log("Important: If Supabase requires email confirmation by default, you may still need to go into the dashboard to Auto-Confirm them, unless you disabled Email Confirmations in the Auth Settings.");
    }
  }
}

createAdmin();
