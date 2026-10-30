import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const dataDetector: Detector = {
  name: 'data',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
