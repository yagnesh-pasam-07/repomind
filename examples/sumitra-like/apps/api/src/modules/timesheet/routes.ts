import { Router } from 'express';
import { db } from '../../db';
export const timesheetRouter = Router();
timesheetRouter.get('/', async (_req, res) => res.json([]));
timesheetRouter.post('/', async (_req, res) => res.sendStatus(201));
