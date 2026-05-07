export default () => ({
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    mongoUri: process.env.MONGO_URI,
    mongoDbName: process.env.MONGO_DB_NAME || 'nest_project',
    jwtSecret: process.env.JWT_SECRET || 'changeme',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'https://app.wisdomtooth.tech',
            'https://www.wisdomtooth.tech',
            'https://wisdomtooth.tech',
          ],

    superAdmin: {
        email: process.env.SUPER_ADMIN_EMAIL,
        password: process.env.SUPER_ADMIN_PASSWORD,
    },

    mail: {
        host: process.env.MAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.MAIL_PORT ?? '587', 10),
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
        from: process.env.MAIL_FROM,
        fromName: process.env.MAIL_FROM_NAME,
    },
    aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        s3Bucket: process.env.AWS_S3_BUCKET,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // calendly: {
    //     apiKey: process.env.CALENDLY_API_KEY,
    //     webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
    //     webhookUrl: process.env.CALENDLY_WEBHOOK_URL,
    // },
    // calendlyWebhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    transcriptSummary: {
        serviceUrl: process.env.SUMMARY_SERVICE_URL || 'http://127.0.0.1:8080/summarize',
        modelId: process.env.SUMMARY_MODEL_ID || 'gpt-4.1-mini',
        modelTimeoutMs: parseInt(process.env.SUMMARY_MODEL_TIMEOUT_MS ?? '30000', 10),
        modelRetries: parseInt(process.env.SUMMARY_MODEL_RETRIES ?? '1', 10),
        maxTranscriptChars: parseInt(process.env.SUMMARY_MAX_TRANSCRIPT_CHARS ?? '32000', 10),
        chunkChars: parseInt(process.env.SUMMARY_CHUNK_CHARS ?? '6000', 10),
        maxNewTokens: parseInt(process.env.SUMMARY_MODEL_MAX_NEW_TOKENS ?? '512', 10),
    },
});
