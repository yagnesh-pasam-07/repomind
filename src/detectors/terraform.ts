import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const terraformDetector: Detector = {
  name: 'terraform',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
