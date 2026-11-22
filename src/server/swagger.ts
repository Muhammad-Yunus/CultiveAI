export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CultivAI Greenhouse Telemetry & Control API',
      version: '1.0.0',
      description:
        'Production API for CultivAI smart hydroponic greenhouse telemetry. Features strictly separated authentication: **Ingest API Key (`X-API-Key`)** for external PLC/IoT hardware ingestion, and **User Bearer JWT (`Authorization: Bearer`)** for web operator sessions, threshold controls, and API key administration. All ingested telemetry persists to PostgreSQL via Drizzle ORM and broadcasts instantaneously to browsers via Socket.IO.',
    },
    servers: [
      {
        url: serverUrl || '/',
        description: 'Current CultivAI Server',
      },
    ],
    tags: [
      {
        name: 'External Ingestion (API Key Auth)',
        description: 'Endpoints for external IoT gateways, PLCs, and simulator scripts using X-API-Key.',
      },
      {
        name: 'Application Auth (User Login)',
        description: 'User registration, login, and session profile endpoints.',
      },
      {
        name: 'API Key Management (User Auth)',
        description: 'Create, list, and revoke external ingestion API keys.',
      },
      {
        name: 'Telemetry & Analytics',
        description: 'Query live greenhouse readings, historical series, and CSV exports.',
      },
      {
        name: 'Zones, Thresholds, Schedules & Alerts',
        description: 'Configure greenhouse zones, target thresholds, automation schedules, and alert acknowledgements.',
      },
      {
        name: 'Harvest AI Assistant',
        description: 'OpenAI-compatible RAG greenhouse expert & forecaster grounded in live PostgreSQL telemetry.',
      },
    ],
    components: {
      securitySchemes: {
        IngestApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Dedicated API key generated in CultivAI UI (prefix: cai_live_...).',
        },
        UserBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'User session JWT obtained from POST /api/auth/login or /api/auth/register.',
        },
      },
      schemas: {
        TelemetryIngestPayload: {
          type: 'object',
          required: [
            'harvestScore',
            'waterFlowL',
            'powerTotalKwh',
            'indoorTempC',
            'airMoisturePct',
            'lightLevelHours',
            'ecLevelMs',
            'growthRate',
            'airCo2Ppm',
          ],
          properties: {
            zoneCode: {
              type: 'string',
              example: 'ZONE-A1',
              description: 'Target greenhouse zone code (defaults to zone bound to API key or ZONE-A1).',
            },
            sourceDevice: {
              type: 'string',
              example: 'plc-hydro-bay-01',
            },
            harvestScore: { type: 'number', minimum: 0, maximum: 100, example: 80 },
            harvestStatus: { type: 'string', example: 'Good Growth' },
            waterFlowL: { type: 'number', minimum: 0, example: 6.75 },
            waterFlowDelta: { type: 'number', example: 3.541 },
            powerTotalKwh: { type: 'number', minimum: 0, example: 144 },
            powerLightingKwh: { type: 'number', minimum: 0, example: 112 },
            powerOtherKwh: { type: 'number', minimum: 0, example: 20 },
            indoorTempC: { type: 'number', minimum: -20, maximum: 80, example: 23 },
            airMoisturePct: { type: 'number', minimum: 0, maximum: 100, example: 68 },
            lightLevelHours: { type: 'number', minimum: 0, maximum: 24, example: 15 },
            ecLevelMs: { type: 'number', minimum: 0, maximum: 20, example: 2.1 },
            growthRate: { type: 'number', minimum: 0, maximum: 10, example: 0.7 },
            airCo2Ppm: { type: 'number', minimum: 0, maximum: 10000, example: 900 },
            recordedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Optional ISO-8601 timestamp for historical backfills; defaults to server UTC now.',
            },
          },
        },
        UserAuthCredentials: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'grower@cultivai.io' },
            password: { type: 'string', minLength: 8, example: 'CultivAI2026!' },
          },
        },
        UserRegisterPayload: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Yunus Pratama' },
            email: { type: 'string', format: 'email', example: 'grower@cultivai.io' },
            password: { type: 'string', minLength: 8, example: 'CultivAI2026!' },
          },
        },
        CreateApiKeyPayload: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'North Bay PLC Gateway' },
            zoneId: { type: 'integer', example: 1 },
          },
        },
      },
    },
    paths: {
      '/api/ingest/health': {
        get: {
          tags: ['External Ingestion (API Key Auth)'],
          summary: 'Verify API Key authentication and PostgreSQL ingest readiness',
          security: [{ IngestApiKeyAuth: [] }],
          responses: {
            '200': { description: 'API key valid and ingestion pipeline ready' },
            '401': { description: 'Missing or malformed X-API-Key header' },
            '403': { description: 'Invalid or revoked API key' },
          },
        },
      },
      '/api/ingest/telemetry': {
        post: {
          tags: ['External Ingestion (API Key Auth)'],
          summary: 'Ingest a single real-time greenhouse sensor frame',
          description:
            'Validates sensor telemetry, inserts into PostgreSQL via Drizzle ORM, checks zone thresholds for automatic alerts, and broadcasts the reading instantaneously to connected browsers via Socket.IO (`telemetry:new`).',
          security: [{ IngestApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TelemetryIngestPayload' },
              },
            },
          },
          responses: {
            '201': { description: 'Reading persisted and broadcasted over Socket.IO' },
            '400': { description: 'Validation error in telemetry payload' },
            '401': { description: 'Missing X-API-Key header' },
            '403': { description: 'Invalid or revoked API key' },
          },
        },
      },
      '/api/ingest/batch': {
        post: {
          tags: ['External Ingestion (API Key Auth)'],
          summary: 'Ingest a chronological batch of historical sensor readings (max 250)',
          security: [{ IngestApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['readings'],
                  properties: {
                    readings: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TelemetryIngestPayload' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Batch persisted and latest frame broadcasted' },
            '400': { description: 'Invalid batch payload' },
          },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Application Auth (User Login)'],
          summary: 'Register a new CultivAI user account (first user becomes admin)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserRegisterPayload' },
              },
            },
          },
          responses: {
            '201': { description: 'User created with Bearer JWT session' },
            '409': { description: 'Email already registered' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Application Auth (User Login)'],
          summary: 'Sign in with email and password to receive a User JWT',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserAuthCredentials' },
              },
            },
          },
          responses: {
            '200': { description: 'Authenticated user object and Bearer JWT' },
            '401': { description: 'Invalid email or password' },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Application Auth (User Login)'],
          summary: 'Get current authenticated user profile',
          security: [{ UserBearerAuth: [] }],
          responses: {
            '200': { description: 'Current user profile' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/keys': {
        get: {
          tags: ['API Key Management (User Auth)'],
          summary: 'List all ingestion API keys (masked prefixes only)',
          security: [{ UserBearerAuth: [] }],
          responses: { '200': { description: 'List of API key records' } },
        },
        post: {
          tags: ['API Key Management (User Auth)'],
          summary: 'Generate a new dedicated external ingestion API key (raw key returned once)',
          security: [{ UserBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateApiKeyPayload' },
              },
            },
          },
          responses: { '201': { description: 'API key generated' } },
        },
      },
      '/api/keys/{id}': {
        delete: {
          tags: ['API Key Management (User Auth)'],
          summary: 'Revoke an ingestion API key',
          security: [{ UserBearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Key revoked' } },
        },
      },
      '/api/telemetry/overview': {
        get: {
          tags: ['Telemetry & Analytics'],
          summary: 'Get latest greenhouse dashboard snapshot and chart series',
          parameters: [
            { name: 'zoneId', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Dashboard snapshot' } },
        },
      },
      '/api/telemetry/history': {
        get: {
          tags: ['Telemetry & Analytics'],
          summary: 'Get paginated historical telemetry readings from PostgreSQL',
          parameters: [
            { name: 'zoneId', in: 'query', required: false, schema: { type: 'integer' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          ],
          responses: { '200': { description: 'Historical telemetry list' } },
        },
      },
      '/api/telemetry/export': {
        get: {
          tags: ['Telemetry & Analytics'],
          summary: 'Download telemetry history as CSV (requires User Login)',
          security: [{ UserBearerAuth: [] }],
          responses: { '200': { description: 'CSV file download' } },
        },
      },
      '/api/zones': {
        get: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'List all configured greenhouse zones',
          responses: { '200': { description: 'List of greenhouse zones' } },
        },
        post: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Create a new greenhouse zone with default environmental thresholds',
          security: [{ UserBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'name'],
                  properties: {
                    code: { type: 'string', example: 'ZONE-C3' },
                    name: { type: 'string', example: 'East Microgreens' },
                    cropType: { type: 'string', example: 'Butterhead Lettuce' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Zone created' },
            '409': { description: 'Zone code already exists' },
          },
        },
      },
      '/api/thresholds/{zoneId}': {
        patch: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Update target environmental thresholds for a zone',
          security: [{ UserBearerAuth: [] }],
          parameters: [
            { name: 'zoneId', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Thresholds updated' } },
        },
      },
      '/api/schedules': {
        get: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'List automation schedules',
          parameters: [
            { name: 'zoneId', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Schedule items' } },
        },
        post: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Create a new greenhouse automation schedule',
          security: [{ UserBearerAuth: [] }],
          responses: { '201': { description: 'Schedule created' } },
        },
      },
      '/api/schedules/{id}': {
        patch: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Toggle schedule active state',
          security: [{ UserBearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Schedule updated' } },
        },
        delete: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Delete a greenhouse automation schedule',
          security: [{ UserBearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Schedule deleted' } },
        },
      },
      '/api/alerts/{id}/ack': {
        patch: {
          tags: ['Zones, Thresholds, Schedules & Alerts'],
          summary: 'Acknowledge a telemetry alert',
          security: [{ UserBearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Alert acknowledged' } },
        },
      },
      '/api/ai/assistant': {
        post: {
          tags: ['Harvest AI Assistant'],
          summary: 'Ask CultivAI Greenhouse Expert (PostgreSQL RAG + OpenAI-Compatible LLM)',
          description:
            'Retrieves up to 60 PostgreSQL telemetry readings, computes VPD (kPa) and linear trend slopes, loads zone thresholds, alerts, and schedules, and queries the configured OpenAI-compatible model (AI_BASE_URL / AI_MODEL / AI_KEY) for expert greenhouse analysis & forecasting.',
          security: [{ UserBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['prompt'],
                  properties: {
                    prompt: {
                      type: 'string',
                      example: 'Analisis kondisi VPD saat ini dan prediksi kesiapan panen.',
                    },
                    zoneId: { type: 'integer', example: 1 },
                    history: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          role: { type: 'string', enum: ['user', 'assistant'] },
                          text: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'RAG-grounded greenhouse expert analysis & forecast' },
            '503': { description: 'AI_KEY, AI_BASE_URL, or AI_MODEL not configured' },
          },
        },
      },
    },
  };
}
