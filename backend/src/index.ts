import 'dotenv/config';
import express, { type Application } from 'express';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database/db.js';

import AllRoutes from './routes/AllRoutes.js';

const app: Application = express();

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
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const apiRouter = express.Router();
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
const frontendPath = path.resolve(process.cwd(), 'frontend/dist');
app.use(express.static(frontendPath));

app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
});

// Export express app for HTTP integration tests
export { app };

// Start Server and Verify PostgreSQL Connection
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', async () => {
        try {
            const result = await pool.query('SELECT NOW() as current_time, current_setting(\'TIMEZONE\') as tz');
            console.log(`✅ Server running on port ${PORT}`);
            console.log('✅ Connected to PostgreSQL:', result.rows[0]);
        } catch (err) {
            console.error('❌ Database connection failed.');
            console.error(err);
        }
    });
}