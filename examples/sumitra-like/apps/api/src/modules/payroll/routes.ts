import { Router } from 'express';
import { db } from '../../db';
import { encryptSalary } from './crypto';
import { uploadPayslip } from './storage';
export const payrollRouter = Router();
payrollRouter.post('/run', async (_req, res) => res.sendStatus(202));
payrollRouter.get('/payslips/:id', async (_req, res) => res.json({}));
