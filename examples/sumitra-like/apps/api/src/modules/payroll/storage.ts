import { Storage } from '@google-cloud/storage';
const storage = new Storage();
export async function uploadPayslip(pdf: Buffer, id: string) { await storage.bucket(process.env.GCS_PAYSLIP_BUCKET!).file(`${id}.pdf`).save(pdf); }
