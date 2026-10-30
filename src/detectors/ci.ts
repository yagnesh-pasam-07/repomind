import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const ciDetector: Detector = {
  name: 'ci',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
