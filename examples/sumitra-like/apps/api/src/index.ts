import express from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import { leaveRouter } from './modules/leave/routes';
import { payrollRouter } from './modules/payroll/routes';
import { timesheetRouter } from './modules/timesheet/routes';
import { authRouter } from './modules/auth/routes';
import { pollsRouter } from './modules/polls/routes';

Sentry.init({ dsn: process.env.SENTRY_DSN });
const app = express();
app.use(cors());
app.use('/auth', authRouter);
app.use('/leave', leaveRouter);
app.use('/payroll', payrollRouter);
app.use('/timesheets', timesheetRouter);
app.use('/polls', pollsRouter);
app.get('/health', (_req, res) => res.send('ok'));
app.listen(process.env.PORT ?? 8080);
