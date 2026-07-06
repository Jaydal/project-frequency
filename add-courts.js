require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function addCourts() {
  console.log("Adding default courts to database...");
  
  const { data, error } = await supabase
    .from('courts')
    .insert([
      { name: 'Court 1' },
      { name: 'Court 2' }
    ]);
    
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Courts added successfully!");
  }
}

addCourts();
