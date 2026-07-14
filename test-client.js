const mqtt = require('mqtt');

// Setup: Ensure you have Mosquitto running locally (or change this to your broker URL)
const broker = 'mqtts://frequency:Frequency@123@594d608708f34a7b9607e86258c3b3ae.s1.eu.hivemq.cloud:8883'; 
const courtId = 'court-1'; // Example court ID from the dashboard

console.log(`[TEST CLIENT] Connecting to MQTT Broker at ${broker}...`);
const client = mqtt.connect(broker);

client.on('connect', () => {
  console.log('[TEST CLIENT] Connected! Simulating the FreqClient library...');
  
  // 1. Publish "online" status just like the FreqClient does
  const statusTopic = `freq.led/courts/${courtId}/status`;
  client.publish(statusTopic, JSON.stringify({ status: 'online', court: courtId }), { retain: true });
  console.log(`[TEST CLIENT] Published online status to ${statusTopic}`);

  // 2. Subscribe to the display instructions
  const displayTopic = `courts/${courtId}/display`;
  client.subscribe(displayTopic, () => {
    console.log(`[TEST CLIENT] Listening for web app display updates on ${displayTopic}...\n`);
    console.log(`(Go to the Web App Dashboard and trigger a Game Start for ${courtId}!)`);
  });
});

client.on('message', (topic, message) => {
  if (topic === `courts/${courtId}/display`) {
    console.log('\n--- NEW DISPLAY PAYLOAD FROM WEB APP ---');
    try {
      const data = JSON.parse(message.toString());
      console.log(`LINE 1: ${data.line1 || ''}`);
      console.log(`LINE 2: ${data.line2 || ''}`);
      console.log(`LINE 3: ${data.line3 || ''}`);
    } catch(e) {
      console.log(`RAW JSON: ${message.toString()}`);
    }
    console.log('----------------------------------------\n');
  }
});
