export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Pickleball Court Prompter API',
    version: '1.0.0',
    description: `Queue management, court booking, and MQTT display system for the Freq pickleball system.

## MQTT Topics

The system uses MQTT for real-time court display updates and ESP32 health monitoring.

### Published Topics

| Topic | Direction | Payload | Description |
|---|---|---|---|
| \`courts/{courtId}/display\` | Server → ESP32 | \`{"line1":"...","line2":"...","line3":"..."}\` | LED matrix display content |
| \`courts/{courtId}/status\` | ESP32 → Server | \`{"status":"online\|offline","ip":"...","rssi":...,"court":"..."}\` | ESP32 health heartbeat |

### Display Payload

\`\`\`json
{
  "line1": "COURT 1",
  "line2": "GAME 15:00",
  "line3": "Player A vs B"
}
\`\`\`

### Status Payload

\`\`\`json
{
  "status": "online",
  "ip": "192.168.1.100",
  "rssi": -65,
  "court": "Court 1"
}
\`\`\`
`,
  },
  servers: [{ url: '/api', description: 'API server' }],
  paths: {
    '/api/queue': {
      get: {
        summary: 'Get queue entries for a member',
        parameters: [
          {
            name: 'memberId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Member UUID to look up queue entries for',
          },
        ],
        responses: {
          '200': {
            description: 'Queue entries (waiting or offered) for the member',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      member_id: { type: 'string', format: 'uuid' },
                      status: { type: 'string', enum: ['waiting', 'offered'] },
                      court_id: { type: 'string', format: 'uuid', nullable: true },
                      expires_at: { type: 'string', format: 'date-time', nullable: true },
                      duration: { type: 'integer' },
                      party_size: { type: 'integer', enum: [2, 4] },
                      match_title: { type: 'string', nullable: true },
                      position: { type: 'integer' },
                      estimatedWait: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Missing memberId parameter',
            content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
          },
        },
      },
      post: {
        summary: 'Join the queue or auto-assign a court',
        description: 'If no one is waiting, tries to assign a court immediately. Otherwise joins the queue.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['memberId', 'start', 'duration', 'partySize', 'playerIds'],
                properties: {
                  memberId: { type: 'string', format: 'uuid', description: 'Primary member UUID' },
                  start: { type: 'string', format: 'date-time', description: 'Requested start time (ISO 8601)' },
                  duration: { type: 'integer', minimum: 1, description: 'Game duration in minutes' },
                  partySize: { type: 'integer', enum: [2, 4], description: '2 = 1v1, 4 = 2v2' },
                  playerIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 4, description: 'Player member UUIDs' },
                  courtId: { type: 'string', format: 'uuid', description: 'Specific court (optional — omit for "Any Court")' },
                  matchTitle: { type: 'string', description: 'Optional match title/name' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Queue entry created or game started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['waiting', 'completed'] },
                    court_id: { type: 'string', format: 'uuid', nullable: true },
                    court_name: { type: 'string', nullable: true },
                    duration: { type: 'integer' },
                    position: { type: 'integer' },
                    estimatedWait: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid payload' },
          '409': { description: 'Member not active or already in queue' },
        },
      },
      patch: {
        summary: 'Accept or decline an offer',
        description: 'When a court becomes available, the first waiting entry is offered. Use this endpoint to accept or decline.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'action'],
                properties: {
                  id: { type: 'string', format: 'uuid', description: 'Queue entry UUID' },
                  action: { type: 'string', enum: ['accept', 'decline'], description: 'Accept the offer (starts game) or decline' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Offer accepted or declined',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    courtName: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          '400': { description: 'Offer expired or already processed' },
          '500': { description: 'Server error' },
        },
      },
    },
    '/api/mqtt': {
      get: {
        summary: 'MQTT broker status, connected court ESP32s, and current display states',
        responses: {
          '200': {
            description: 'Broker connection status, court health data, and display contents',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    connected: { type: 'boolean', description: 'MQTT broker connection state' },
                    courts: {
                      type: 'object',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          status: { type: 'string', enum: ['online', 'offline'] },
                          ip: { type: 'string' },
                          rssi: { type: 'integer' },
                          court: { type: 'string' },
                          seenAt: { type: 'integer', description: 'Unix timestamp of last heartbeat' },
                        },
                      },
                    },
                    displays: {
                      type: 'object',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          line1: { type: 'string' },
                          line2: { type: 'string' },
                          line3: { type: 'string' },
                        },
                      },
                      description: 'Last published display content per court',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/mqtt/publish': {
      post: {
        summary: 'Publish a test display message to an ESP32 court display',
        description: 'Publishes an MQTT message to \`courts/{courtId}/display\` for debugging.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courtId'],
                properties: {
                  courtId: { type: 'string', description: 'Court UUID or number identifier' },
                  line1: { type: 'string', maxLength: 16, description: 'First display line' },
                  line2: { type: 'string', maxLength: 16, description: 'Second display line' },
                  line3: { type: 'string', maxLength: 16, description: 'Third display line' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Publish result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    published: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid payload' },
        },
      },
    },
    '/api/display/state/{courtId}': {
      get: {
        summary: 'Get the current LED display state for a specific court',
        description: 'Returns the last published MQTT display payload for the court. The display data is cached from MQTT retained messages (published with \`retain: true\`).',
        parameters: [
          {
            name: 'courtId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Court UUID or number identifier',
          },
        ],
        responses: {
          '200': {
            description: 'Current display state and ESP32 status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    courtId: { type: 'string' },
                    display: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        line1: { type: 'string' },
                        line2: { type: 'string' },
                        line3: { type: 'string' },
                      },
                    },
                    status: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        status: { type: 'string', enum: ['online', 'offline'] },
                        ip: { type: 'string' },
                        rssi: { type: 'integer' },
                        court: { type: 'string' },
                        seenAt: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
