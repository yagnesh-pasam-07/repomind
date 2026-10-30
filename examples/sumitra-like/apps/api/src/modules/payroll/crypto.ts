import { KeyManagementServiceClient } from '@google-cloud/kms';
const kms = new KeyManagementServiceClient();
export async function encryptSalary(plain: string) { return kms.encrypt({ name: process.env.KMS_KEY_NAME, plaintext: Buffer.from(plain) }); }
