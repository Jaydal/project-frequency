require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectId = 'iqkebvbcspnohjxanehl';
const password = 'gemini';
const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected! Running ALTER TABLE...");
    await client.query('ALTER TABLE queue_entries DROP CONSTRAINT queue_entries_duration_check;');
    await client.query('ALTER TABLE queue_entries ADD CONSTRAINT queue_entries_duration_check CHECK (duration > 0);');
    console.log("Constraint fixed!");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}
run();
