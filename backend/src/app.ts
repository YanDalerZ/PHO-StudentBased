import 'dotenv/config';
import express, { type Application } from 'express';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';

import AllRoutes from './routes/AllRoutes.js';

const app: Application = express();

if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://pho-studentbased.onrender.com",
];

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
apiRouter.use('/users', AllRoutes.UserRoutes);
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

app.use('/api/v1', apiRouter);
// Deprecated /api route alias for backward compatibility during migration
app.use('/api', apiRouter);

// Serving static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serving frontend static files
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
});

export default app;
