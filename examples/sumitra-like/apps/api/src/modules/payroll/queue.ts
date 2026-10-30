import { Queue } from 'bullmq';
export const payrollQueue = new Queue('payroll', { connection: { host: process.env.REDIS_HOST } });
