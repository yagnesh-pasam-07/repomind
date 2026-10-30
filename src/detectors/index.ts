import { ciDetector } from './ci.js';
import { containersDetector } from './containers.js';
import { dataDetector } from './data.js';
import { frameworksDetector } from './frameworks.js';
import { integrationsDetector } from './integrations.js';
import { routesDetector } from './routes.js';
import { terraformDetector } from './terraform.js';
import type { Detector } from './types.js';
import { workspaceDetector } from './workspace.js';

export const detectors: Detector[] = [
  workspaceDetector,
  frameworksDetector,
  routesDetector,
  dataDetector,
  integrationsDetector,
  containersDetector,
  ciDetector,
  terraformDetector,
];
