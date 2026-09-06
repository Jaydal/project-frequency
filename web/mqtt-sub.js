const mqtt = require('mqtt');

const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

client.on('connect', () => {
  console.log('Connected to HiveMQ');
  client.subscribe('courts/+/display');
});

client.on('message', (topic, message) => {
  console.log(`\n--- NEW PAYLOAD ON ${topic} ---`);
  console.log(message.toString());
  console.log('--------------------------------\n');
});
