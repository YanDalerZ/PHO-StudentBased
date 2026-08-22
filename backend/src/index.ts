import 'dotenv/config';
import express, { type Application } from 'express';
import cors from 'cors';
//import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
//import pool from './database/db.js';
//import * as AllRoutes from './routes/AllRoutes.js';

const app: Application = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;


const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://baranggay-183.onrender.com",
].filter(Boolean) as string[];

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
//app.use(cookieParser());

// app.use('/api/login', AllRoutes.LoginRoute);
// app.use('/api/user', AllRoutes.UserRoute);
// app.use('/api/benefits', AllRoutes.BenefitsRoute);
// app.use('/api/events', AllRoutes.EventsRoute);
// app.use('/api/notifications', AllRoutes.NotificationsRoute);
// app.use('/api/serviceguide', AllRoutes.ServiceGuideRoute);
// app.use('/api/appointments', AllRoutes.AppointmentRoute);
// app.use('/api/applications', AllRoutes.ApplicationsRoute);
// app.use('/api/risk', AllRoutes.RiskMapRoute);
// app.use('/api/superadmin', AllRoutes.SuperAdminRoute);
// app.use('/api/config', AllRoutes.GlobalConfigurationRoute);
// app.use('/api/database', AllRoutes.DatabaseRoute);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));
app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
});
app.listen(PORT, '0.0.0.0', async () => {
    try {
        //const conn = await pool.getConnection();
        console.log(`✅ Server running on port ${PORT} & Connected to Aiven.`);
        //const [rows] = await pool.execute('SELECT NOW() as currentTime, @@session.time_zone as tz');
        // console.log(rows);


        // conn.release();
    } catch (err) {
        console.error('❌ Database connection failed.');
        console.error(err);
    }
});