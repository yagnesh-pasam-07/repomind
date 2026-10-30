import type { Detector } from './types.js';

// TODO: implement — see PRODUCT.md, "Scope v1".
export const containersDetector: Detector = {
  name: 'containers',
  async detect() {
    return { nodes: [], edges: [] };
  },
};
