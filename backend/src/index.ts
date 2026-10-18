import 'dotenv/config';
import express, { type Application } from 'express';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database/db.js';

import AllRoutes from './routes/AllRoutes.js';
import { publicRegistrationPageHeaders } from './middleware/publicRegistrationSecurity.js';
import { approvedRegistrationOrigins } from './config/publicRegistration.js';

const app: Application = express();

const trustProxyHopsRaw = process.env.TRUST_PROXY_HOPS?.trim();
const trustProxyHops = trustProxyHopsRaw
    ? Number(trustProxyHopsRaw)
    : process.env.NODE_ENV === 'production' ? 1 : 0;
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10.');
}
if (trustProxyHops > 0) {
    // Render terminates HTTPS at a reverse proxy. Trust only the configured
    // number of hops so req.ip reflects the client used by QR rate limiting.
    app.set('trust proxy', trustProxyHops);
}

if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    "https://pho-studentbased.onrender.com",
    process.env.APP_ORIGIN,
    ...approvedRegistrationOrigins(),
].filter((origin): origin is string => Boolean(origin));

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposedHeaders: ["Content-Disposition"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

// Render may use this path as its health check. Do not expose database details.
app.get('/healthz', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok' });
    } catch {
        res.status(503).json({ status: 'unavailable' });
    }
});

const apiRouter = express.Router();
apiRouter.use('/', AllRoutes.RegistrationRoutes);
apiRouter.use('/', AllRoutes.ReportRoutes);
apiRouter.use('/', AllRoutes.ReportTargetRoutes);
apiRouter.use('/students', AllRoutes.StudentRoutes);
apiRouter.use('/auth', AllRoutes.AuthRoutes);
apiRouter.use('/lookup', AllRoutes.LookupRoutes);
apiRouter.use('/modules/patient-info', AllRoutes.PatientInfoRoutes);
apiRouter.use('/modules/oral-health', AllRoutes.OralHealthRoutes);
apiRouter.use('/modules/deworming', AllRoutes.DewormingRoutes);
apiRouter.use('/modules/immunization', AllRoutes.ImmunizationRoutes);
apiRouter.use('/modules/vital-signs', AllRoutes.VitalSignsRoutes);
apiRouter.use('/dashboard', AllRoutes.DashboardRoutes);
apiRouter.use('/admin', AllRoutes.AdminRoutes);

// Documented primary prefix
app.use('/api/v1', apiRouter);
// Compatibility alias
app.use('/api', apiRouter);

// Serving static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serving frontend static files
const frontendPath = path.resolve(__dirname, '../../frontend/dist');
app.use(/^\/register\/[a-f0-9]{32}\/?$/i, publicRegistrationPageHeaders);
app.use(express.static(frontendPath));

app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
        res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
        return;
    }
    next(error);
});

// Export express app for HTTP integration tests
export { app };

// Do not accept traffic until the database is reachable. A failed startup must
// exit non-zero so the hosting platform does not report a broken app as ready.
async function startServer(): Promise<void> {
    try {
        await pool.query('SELECT 1');
    } catch (error) {
        const failure = error && typeof error === 'object' ? error as { code?: string; message?: string } : null;
        console.error('Database connection failed during startup.', {
            code: failure?.code ?? 'UNKNOWN',
            message: failure?.message ?? 'Unknown database error',
        });
        await pool.end();
        process.exitCode = 1;
        return;
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}; PostgreSQL connection verified.`);
    });
    server.on('error', (error) => {
        console.error('Server failed to listen:', error);
        process.exitCode = 1;
        void pool.end();
    });
}

if (process.env.NODE_ENV !== 'test') {
    void startServer();
}
