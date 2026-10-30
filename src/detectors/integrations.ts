import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const integrationsDetector: Detector = {
  name: 'integrations',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
