import { Router } from 'express';
import { db } from '../../db';
import { notifyManager } from '../notifications/slack';
import { sendEmail } from '../notifications/email';
export const leaveRouter = Router();
leaveRouter.get('/', async (_req, res) => res.json(await db.leaveRequest.findMany()));
leaveRouter.post('/apply', async (req, res) => { await notifyManager(req.body); await sendEmail(req.body); res.sendStatus(201); });
leaveRouter.post('/:id/approve', async (_req, res) => res.sendStatus(200));
leaveRouter.get('/plans', async (_req, res) => res.json([]));
