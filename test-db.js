require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// URL is https://iqkebvbcspnohjxanehl.supabase.co
const projectId = 'iqkebvbcspnohjxanehl';
const password = process.env.DB_PASSWORD || '';

const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting...");
    await client.connect();
    console.log("Connected! Running schema...");
    const sql = fs.readFileSync(path.join(__dirname, 'supabase', 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log("Schema applied successfully!");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

run();
