import { Router } from 'express';
import { postPoll } from '../notifications/slack';
export const pollsRouter = Router();
pollsRouter.post('/', async (req, res) => { await postPoll(req.body); res.sendStatus(201); });
pollsRouter.post('/:id/vote', async (_req, res) => res.sendStatus(200));
