import { Router } from 'express';
import Redis from 'ioredis';
const sessions = new Redis(process.env.REDIS_URL!);
export const authRouter = Router();
authRouter.post('/login', async (_req, res) => res.json({ token: 'x' }));
authRouter.post('/otp', async (_req, res) => res.sendStatus(204));
