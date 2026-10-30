import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const routesDetector: Detector = {
  name: 'routes',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
