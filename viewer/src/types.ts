export interface Block {
  x: number;
  y: number;
  z: number;
  type: string;
}

export interface Size3D {
  x: number;
  y: number;
  z: number;
}

export interface Blueprint {
  name: string;
  size: Size3D;
  blocks: Block[];
}

export interface SliceState {
  axis: 'x' | 'y' | 'z';
  layer: number;
  mode: 'single' | 'range' | 'all';
  maxLayers: { x: number; y: number; z: number };
}

export interface MaterialCount {
  type: string;
  displayName: string;
  count: number;
  stacks: number;
  category: string;
}
