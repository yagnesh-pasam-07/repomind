import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const frameworksDetector: Detector = {
  name: 'frameworks',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
