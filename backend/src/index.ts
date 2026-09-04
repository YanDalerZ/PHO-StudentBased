import 'dotenv/config';
import express, { type Application } from 'express';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database/db.js';

import AllRoutes from './routes/AllRoutes.js';

const app: Application = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

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
app.use(express.json());

app.use('/api/users', AllRoutes.UserRoutes);
app.use('/api/students', AllRoutes.StudentRoutes);
app.use('/api/auth', AllRoutes.AuthRoutes);
app.use('/api/lookup', AllRoutes.LookupRoutes);

// Serving static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serving frontend static files
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
});

// Start Server and Verify Aiven Postgres Connection
app.listen(PORT, '0.0.0.0', async () => {
    try {
        // Test query to confirm Aiven PostgreSQL connection
        const result = await pool.query('SELECT NOW() as current_time, current_setting(\'TIMEZONE\') as tz');
        console.log(`✅ Server running on port ${PORT}`);
        console.log('✅ Connected to Aiven PostgreSQL:', result.rows[0]);
    } catch (err) {
        console.error('❌ Database connection failed.');
        console.error(err);
    }
});