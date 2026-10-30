import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const workspaceDetector: Detector = {
  name: 'workspace',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
