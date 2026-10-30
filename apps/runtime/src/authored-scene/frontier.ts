import {
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import {
  ISO,
  STRONGHOLD_ORIGIN,
  mapToCourt,
  type FootprintColumn,
  type ReliefFeature,
} from "./environment-map";

export type FrontierRect = readonly [
  u0: number,
  v0: number,
  u1: number,
  v1: number,
];

export type FrontierLayerKind = "ground" | "upright" | "cap";
export type FrontierGroundBand = "under" | "over";

export type FrontierKitItem = {
  layer: FrontierLayerKind;
  block: readonly FrontierRect[];
  band?: FrontierGroundBand;
};

export type FrontierSpriteMeta = {
  kit: "v2" | "v3";
  frame: readonly [x: number, y: number, w: number, h: number];
  world: readonly [w: number, h: number];
  pivot: readonly [ax: number, ay: number];
  shear?: number;
  heightM: number;
  footprintM: readonly [uM: number, vM: number];
  ground: readonly number[];
};

export type FrontierPlacement = {
  a: string;
  u: number;
  v: number;
  s?: number;
  f?: number;
  r?: number;
  lift?: number;
  on?: { u: number; v: number };
  zone?: string;
};

export type FrontierProp = {
  id: string;
  asset: string;
  x: number;
  y: number;
  u: number;
  v: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  scale: number;
  flip: boolean;
  rotate?: number;
  shear: number;
  lift: number;
  zBoost: number;
  front?: (x: number) => number | null;
  layer: FrontierLayerKind;
  band: number;
  solid: boolean;
  footprint: readonly FrontierRect[];
  zone?: string;
};

export const FRONTIER_TERRAIN_FEATURES: ReliefFeature[] = [
  {
    id: "temple-podium",
    type: "plateau",
    visual: "scenery",
    u0: 477.921,
    v0: 490.521,
    u1: 479.879,
    v1: 494.479,
    heightM: 1.0541666666666667,
  },
  {
    id: "temple-stairs",
    type: "ramp",
    connectsTo: "temple-podium",
    visual: "scenery",
    u0: 479.879,
    v0: 492.01,
    u1: 480.479,
    v1: 492.99,
    baseM: 0,
    topM: 1.0541666666666667,
    ascend: "-u",
  },
];

export const FROZEN_FRONTIER_SPRITES: Record<string, FrontierSpriteMeta> = {
  "ruined-gate": {
    kit: "v2",
    frame: [1080, 612, 545, 386],
    world: [241.82, 171.08],
    pivot: [0.5, 0.868],
    heightM: 4,
    footprintM: [5, 1.5],
    ground: [0.6891, 0.7229, 0.7801, 0.7815, 0.7507, 0.7844, 0.7315, 0.6832, 0.7623, 0.8414, 0.928, 0.9238, 0.9652, 0.9941, 0.9595, 0.9323, 0.8739],
  },
  "broken-watchtower": {
    kit: "v2",
    frame: [287, 0, 586, 584],
    world: [260.35, 259.27],
    pivot: [0.5104, 0.8583],
    heightM: 6,
    footprintM: [4, 4],
    ground: [0.7844, 0.8377, 0.8796, 0.9271, 0.9229, 0.9323, 0.9281, 0.9587, 0.975, 0.9833, 0.9926, 0.9792, 0.9688, 0.9385, 0.924, 0.8219, 0.8219],
  },
  "snowy-shrine": {
    kit: "v2",
    frame: [1097, 1059, 259, 292],
    world: [114.93, 129.48],
    pivot: [0.5, 0.8591],
    heightM: 3,
    footprintM: [3, 3],
    ground: [0.7772, 0.8051, 0.8766, 0.9107, 0.9289, 0.9429, 0.9532, 0.9641, 0.9687, 0.9761, 0.9614, 0.9336, 0.9125, 0.9029, 0.8742, 0.8059, 0.767],
  },
  "pine-tall": {
    kit: "v2",
    frame: [0, 0, 285, 610],
    world: [126.36, 270.58],
    pivot: [0.5, 0.9587],
    heightM: 7,
    footprintM: [2.5, 2.5],
    ground: [0.8484, 0.8484, 0.8492, 0.8952, 0.9036, 0.8883, 0.9645, 0.9746, 0.9753, 0.979, 0.9782, 0.9739, 0.9394, 0.9014, 0.911, 0.8723, 0.8687],
  },
  "pine-broad": {
    kit: "v2",
    frame: [0, 612, 474, 445],
    world: [210.49, 197.75],
    pivot: [0.5, 0.9388],
    heightM: 5,
    footprintM: [3.8, 3.8],
    ground: [0.7686, 0.8152, 0.8269, 0.8132, 0.8331, 0.8149, 0.8283, 0.9405, 0.9603, 0.9752, 0.9736, 0.9587, 0.9401, 0.868, 0.886, 0.9124, 0.757],
  },
  "pine-sapling": {
    kit: "v2",
    frame: [1440, 1655, 89, 160],
    world: [39.13, 70.37],
    pivot: [0.5, 0.9482],
    heightM: 1.8,
    footprintM: [1, 1],
    ground: [0.6874, 0.7045, 0.7594, 0.7504, 0.7512, 0.7727, 0.8014, 0.9582, 0.9784, 0.9801, 0.981, 0.9024, 0.8033, 0.7968, 0.7912, 0.7919, 0.785],
  },
  "dead-tree": {
    kit: "v2",
    frame: [0, 1059, 381, 357],
    world: [169.29, 158.52],
    pivot: [0.5, 0.937],
    heightM: 4,
    footprintM: [2, 2],
    ground: [0.6468, 0.6468, 0.6468, 0.6976, 0.8041, 0.9055, 0.927, 0.9801, 0.9685, 0.9635, 0.9519, 0.99, 0.9337, 0.9436, 0.8839, 0.8574, 0.8574],
  },
  "dead-snag": {
    kit: "v2",
    frame: [1549, 1418, 173, 228],
    world: [76.77, 101.08],
    pivot: [0.4705, 0.9175],
    heightM: 2.5,
    footprintM: [1.2, 1.2],
    ground: [0.8514, 0.8679, 0.8679, 0.8762, 0.9186, 0.8998, 0.9751, 0.9579, 0.9858, 0.965, 0.954, 0.9847, 0.9599, 0.9717, 0.9772, 0.9479, 0.9198],
  },
  "shrub-juniper": {
    kit: "v2",
    frame: [1028, 1872, 139, 82],
    world: [61.49, 36.09],
    pivot: [0.5, 0.8254],
    heightM: 0.8,
    footprintM: [1.3, 1],
    ground: [0.6111, 0.7143, 0.7447, 0.8519, 0.8763, 0.9178, 0.8853, 0.9277, 0.9431, 0.9312, 0.9101, 0.8571, 0.7817, 0.8386, 0.8201, 0.6822, 0.582],
  },
  "shrub-twigs": {
    kit: "v2",
    frame: [893, 1872, 133, 84],
    world: [59.08, 37.34],
    pivot: [0.5, 0.8968],
    heightM: 0.9,
    footprintM: [1.2, 1],
    ground: [0.4201, 0.6605, 0.7985, 0.8297, 0.9017, 0.9238, 0.9291, 0.9484, 0.9435, 0.9582, 0.9211, 0.9214, 0.9066, 0.8196, 0.7494, 0.688, 0.6437],
  },
  "grass-tussock": {
    kit: "v2",
    frame: [1827, 1872, 68, 52],
    world: [29.85, 22.81],
    pivot: [0.5, 0.8963],
    heightM: 0.55,
    footprintM: [0.65, 0.65],
    ground: [0.7825, 0.7398, 0.8788, 0.8345, 0.8933, 0.9065, 0.876, 0.9187, 0.8811, 0.8882, 0.9512, 0.8943, 0.9289, 0.8841, 0.7899, 0.8228, 0.8862],
  },
  "grass-patch": {
    kit: "v2",
    frame: [634, 1995, 96, 28],
    world: [42.55, 12.62],
    pivot: [0.5, 0.7435],
    heightM: 0.25,
    footprintM: [1.3, 0.7],
    ground: [0.8063, 0.8115, 0.8567, 0.8272, 0.8874, 0.9005, 0.9116, 0.9215, 0.9372, 0.8937, 0.8953, 0.9162, 0.9228, 0.911, 0.8743, 0.8377, 0.7853],
  },
  "rock-boulders": {
    kit: "v2",
    frame: [231, 1872, 248, 106],
    world: [109.98, 46.96],
    pivot: [0.5, 0.7164],
    heightM: 0.9,
    footprintM: [2, 1.4],
    ground: [0.8255, 0.9491, 0.9636, 0.9745, 0.9818, 0.9636, 0.9273, 0.8582, 0.8764, 0.9236, 0.9345, 0.9345, 0.9455, 0.9527, 0.9432, 0.9018, 0.8691],
  },
  "rock-scatter": {
    kit: "v2",
    frame: [395, 1995, 160, 42],
    world: [70.78, 18.68],
    pivot: [0.5, 0.6059],
    heightM: 0.3,
    footprintM: [1.4, 0.8],
    ground: [0.6176, 0.6904, 0.7471, 0.7765, 0.8515, 0.8765, 0.9301, 0.9353, 0.9824, 0.9706, 0.9471, 0.9118, 0.9044, 0.8765, 0.8118, 0.754, 0.5235],
  },
  "wall-ne": {
    kit: "v3",
    frame: [1180, 1418, 367, 229],
    world: [163, 101.75],
    pivot: [0.4908, 0.7022],
    heightM: 2.4,
    footprintM: [3, 0.45],
    ground: [0.8256, 0.8894, 0.9386, 0.936, 0.89, 0.8575, 0.8277, 0.7887, 0.7457, 0.7096, 0.6732, 0.6388, 0.6038, 0.5749, 0.5405, 0.4963, 0.4644],
  },
  "wall-se": {
    kit: "v3",
    frame: [811, 1418, 367, 230],
    world: [163, 102],
    pivot: [0.4908, 0.7022],
    heightM: 2.4,
    footprintM: [3, 0.45],
    ground: [0.5049, 0.5458, 0.5818, 0.608, 0.6422, 0.6751, 0.7108, 0.752, 0.7745, 0.824, 0.8431, 0.8725, 0.9069, 0.9363, 0.9372, 0.8799, 0.8358],
  },
  "corner-n": {
    kit: "v3",
    frame: [0, 1418, 364, 235],
    world: [161.5, 104.25],
    pivot: [0.4954, 0.7141],
    heightM: 2.4,
    footprintM: [1.5, 1.5],
    ground: [0.5324, 0.5827, 0.6361, 0.6857, 0.7344, 0.7903, 0.8414, 0.9065, 0.9592, 0.9065, 0.8462, 0.7975, 0.7482, 0.6906, 0.6379, 0.5899, 0.5444],
  },
  "corner-s": {
    kit: "v3",
    frame: [726, 1655, 364, 204],
    world: [161.75, 90.5],
    pivot: [0.5139, 0.7569],
    heightM: 2.4,
    footprintM: [1.5, 1.5],
    ground: [0.5028, 0.5829, 0.6402, 0.6878, 0.7541, 0.8201, 0.8653, 0.9244, 0.9862, 0.9392, 0.8874, 0.8229, 0.7624, 0.6965, 0.6347, 0.5497, 0.4917],
  },
  "arch-ne": {
    kit: "v3",
    frame: [383, 1059, 389, 333],
    world: [172.5, 147.5],
    pivot: [0.4986, 0.8125],
    shear: -0.25,
    heightM: 3.6,
    footprintM: [3, 0.65],
    ground: [0.8339, 0.873, 0.9121, 0.9525, 0.9593, 0.9373, 0.9044, 0.8495, 0.8081, 0.7666, 0.7475, 0.7966, 0.8021, 0.802, 0.7814, 0.7627, 0.7305],
  },
  "arch-se": {
    kit: "v3",
    frame: [1627, 612, 391, 362],
    world: [173.5, 160.75],
    pivot: [0.4957, 0.8151],
    shear: 0.29,
    heightM: 3.6,
    footprintM: [3, 0.65],
    ground: [0.7714, 0.7885, 0.8087, 0.8196, 0.8293, 0.8249, 0.7856, 0.7952, 0.8353, 0.8753, 0.9145, 0.9425, 0.9561, 0.9751, 0.9456, 0.9207, 0.8896],
  },
  "pillar-intact": {
    kit: "v3",
    frame: [1839, 1059, 119, 256],
    world: [52.75, 113.5],
    pivot: [0.4649, 0.8643],
    heightM: 2.42,
    footprintM: [0.88, 0.88],
    ground: [0.8612, 0.8659, 0.8811, 0.8943, 0.9086, 0.9229, 0.9422, 0.9537, 0.9493, 0.9405, 0.9273, 0.9133, 0.9031, 0.8855, 0.8634, 0.8612, 0.8612],
  },
  "pillar-broken": {
    kit: "v3",
    frame: [1319, 1655, 119, 166],
    world: [52.75, 73.5],
    pivot: [0.4649, 0.7932],
    heightM: 1.3,
    footprintM: [0.88, 0.88],
    ground: [0.7823, 0.7861, 0.8197, 0.838, 0.8707, 0.8865, 0.9082, 0.932, 0.9252, 0.9048, 0.8878, 0.8639, 0.8486, 0.8333, 0.7891, 0.7857, 0.7857],
  },
  "stairs-ne": {
    kit: "v3",
    frame: [0, 1655, 251, 215],
    world: [111.25, 95.5],
    pivot: [0.4816, 0.6963],
    heightM: 1.13,
    footprintM: [1.98, 2.34],
    ground: [0.7068, 0.7349, 0.7683, 0.805, 0.8403, 0.8815, 0.9228, 0.9503, 0.9346, 0.8914, 0.8626, 0.8187, 0.7775, 0.7461, 0.7199, 0.6695, 0.6571],
  },
  "stairs-nw": {
    kit: "v3",
    frame: [253, 1655, 303, 210],
    world: [134.25, 93],
    pivot: [0.4993, 0.6296],
    heightM: 0.77,
    footprintM: [1.8, 3.6],
    ground: [0.7177, 0.7527, 0.7984, 0.8401, 0.8844, 0.9315, 0.9516, 0.9046, 0.8683, 0.8145, 0.7823, 0.7325, 0.6828, 0.6398, 0.5941, 0.547, 0.5161],
  },
  rubble: {
    kit: "v3",
    frame: [0, 1872, 229, 121],
    world: [101.5, 53.5],
    pivot: [0.4901, 0.6322],
    heightM: 0.5,
    footprintM: [1.5, 1],
    ground: [0.514, 0.5529, 0.6308, 0.6636, 0.743, 0.7757, 0.7897, 0.8084, 0.8201, 0.8309, 0.8452, 0.8952, 0.8785, 0.8551, 0.8084, 0.6323, 0.6075],
  },
  foundation: {
    kit: "v3",
    frame: [476, 612, 602, 394],
    world: [267.25, 175],
    pivot: [0.4874, 0.541],
    heightM: 0.3,
    footprintM: [6, 6],
    ground: [0.6314, 0.6314, 0.6393, 0.6918, 0.7471, 0.8157, 0.8671, 0.9257, 0.9586, 0.9104, 0.8464, 0.8014, 0.7443, 0.6914, 0.6436, 0.5957, 0.5643],
  },
  "floor-sunk": {
    kit: "v3",
    frame: [1358, 1059, 479, 263],
    world: [212.5, 116.5],
    pivot: [0.5094, 0.5221],
    heightM: 0,
    footprintM: [6, 6],
    ground: [0.5258, 0.573, 0.6312, 0.6781, 0.7135, 0.7768, 0.8004, 0.8452, 0.9635, 0.9206, 0.8592, 0.8026, 0.7597, 0.7214, 0.6438, 0.5667, 0.5279],
  },
  paving: {
    kit: "v3",
    frame: [366, 1418, 443, 232],
    world: [196.75, 103],
    pivot: [0.4956, 0.4956],
    heightM: 0,
    footprintM: [6, 6],
    ground: [0.5, 0.527, 0.6214, 0.6829, 0.7342, 0.7937, 0.8641, 0.9147, 0.9612, 0.8811, 0.8277, 0.7248, 0.665, 0.6311, 0.5758, 0.5194, 0.5],
  },
  "flagstones-a": {
    kit: "v3",
    frame: [481, 1872, 189, 94],
    world: [84, 41.75],
    pivot: [0.4881, 0.497],
    heightM: 0,
    footprintM: [2.13953488372093, 0.9627906976744186],
    ground: [0.5449, 0.5449, 0.6287, 0.7055, 0.7725, 0.8024, 0.884, 0.9135, 0.9341, 0.8982, 0.8683, 0.8443, 0.7665, 0.7425, 0.6999, 0.5146, 0.509],
  },
  "flagstones-b": {
    kit: "v3",
    frame: [1544, 1872, 171, 69],
    world: [75.75, 30.75],
    pivot: [0.5182, 0.4715],
    heightM: 0,
    footprintM: [1.8604651162790697, 0.7441860465116279],
    ground: [0.5447, 0.5447, 0.6504, 0.7073, 0.7805, 0.8049, 0.8293, 0.8699, 0.9187, 0.9024, 0.878, 0.8293, 0.7886, 0.7368, 0.7236, 0.3171, 0.3171],
  },
  "flagstones-c": {
    kit: "v3",
    frame: [1169, 1872, 219, 82],
    world: [97, 36.5],
    pivot: [0.5232, 0.4932],
    heightM: 0,
    footprintM: [2.4186046511627906, 0.9069767441860465],
    ground: [0.5753, 0.5753, 0.6438, 0.7466, 0.8014, 0.8699, 0.8836, 0.8789, 0.9178, 0.8994, 0.9101, 0.9041, 0.8955, 0.8061, 0.7055, 0.4658, 0.4589],
  },
  "flagstones-d": {
    kit: "v3",
    frame: [1390, 1872, 152, 71],
    world: [67.25, 31.5],
    pivot: [0.4796, 0.496],
    heightM: 0,
    footprintM: [1.6744186046511629, 0.7953488372093023],
    ground: [0.4524, 0.4524, 0.7143, 0.8095, 0.8413, 0.881, 0.9048, 0.9226, 0.9365, 0.9048, 0.8889, 0.8651, 0.8254, 0.8016, 0.7262, 0.5952, 0.5952],
  },
  "stone-chips-a": {
    kit: "v3",
    frame: [1717, 1872, 108, 54],
    world: [47.75, 24],
    pivot: [0.4293, 0.5667],
    heightM: 0.15,
    footprintM: [1.302325581395349, 0.6046511627906976],
    ground: [0.7083, 0.7292, 0.75, 0.7188, 0.6875, 0.8372, 0.875, 0.8333, 0.6271, 0.4044, 0.4036, 0.4271, 0.4115, 0.8333, 0.8229, 0.8125, 0.8125],
  },
  "stone-chips-b": {
    kit: "v3",
    frame: [1897, 1872, 84, 48],
    world: [37, 21.25],
    pivot: [0.4324, 0.5859],
    heightM: 0.15,
    footprintM: [1.0232558139534884, 0.5116279069767442],
    ground: [0.6824, 0.6868, 0.7529, 0.7765, 0.7647, 0.7529, 0.7765, 0.7882, 0.7824, 0.7213, 0.2824, 0.3059, 0.3059, 0.289, 0.2706, 0.2706, 0.2706],
  },
  "drift-ne": {
    kit: "v3",
    frame: [264, 1995, 129, 43],
    world: [80.25, 26.75],
    pivot: [0.4829, 0.486],
    heightM: 0.21621621621621623,
    footprintM: [2.13953488372093, 0.6976744186046512],
    ground: [0.729, 0.7664, 0.8318, 0.8318, 0.8224, 0.7944, 0.7757, 0.7477, 0.7009, 0.6542, 0.5981, 0.5514, 0.486, 0.4206, 0.3364, 0.2243, 0.2243],
  },
  "drift-se": {
    kit: "v3",
    frame: [138, 1995, 124, 44],
    world: [77, 27.25],
    pivot: [0.487, 0.4954],
    heightM: 0.21621621621621623,
    footprintM: [2.13953488372093, 0.6976744186046512],
    ground: [0.2018, 0.2494, 0.3979, 0.4771, 0.5321, 0.5963, 0.6514, 0.6972, 0.7339, 0.7523, 0.7787, 0.7987, 0.8257, 0.844, 0.8165, 0.789, 0.789],
  },
  "drift-mound": {
    kit: "v3",
    frame: [557, 1995, 75, 36],
    world: [46.75, 22.5],
    pivot: [0.4572, 0.4667],
    heightM: 0.16216216216216217,
    footprintM: [1.1162790697674418, 0.9302325581395349],
    ground: [0.4, 0.4486, 0.5667, 0.7, 0.7667, 0.7889, 0.8, 0.8, 0.7889, 0.7667, 0.7556, 0.7347, 0.7056, 0.6319, 0.5444, 0.5444, 0.5444],
  },
  "ground-scuff-a": {
    kit: "v3",
    frame: [672, 1872, 219, 87],
    world: [182.5, 72.25],
    pivot: [0.5178, 0.4948],
    heightM: 0,
    footprintM: [5.116279069767442, 1.9534883720930232],
    ground: [0.4429, 0.4429, 0.6704, 0.6141, 0.3801, 0.6332, 0.8028, 0.8304, 0.7266, 0.8417, 0.6954, 0.7474, 0.5649, 0.6825, 0.6298, 0.4698, 0.5052],
  },
  "ground-scuff-b": {
    kit: "v3",
    frame: [0, 1995, 136, 46],
    world: [113, 38.5],
    pivot: [0.4889, 0.526],
    heightM: 0,
    footprintM: [3.255813953488372, 1.069767441860465],
    ground: [0.8182, 0.8182, 0.7825, 0.455, 0.8052, 0.8312, 0.7273, 0.8442, 0.6934, 0.8506, 0.7208, 0.8052, 0.5698, 0.6429, 0.6419, 0.4249, 0.5714],
  },
  "column-fallen": {
    kit: "v3",
    frame: [1531, 1655, 186, 126],
    world: [82.25, 55.75],
    pivot: [0.4468, 0.5691],
    heightM: 0.5,
    footprintM: [2.66, 0.7],
    ground: [0.3767, 0.4126, 0.4484, 0.5, 0.5605, 0.6166, 0.6637, 0.6771, 0.7444, 0.7892, 0.8475, 0.8946, 0.9058, 0.8632, 0.8117, 0.7668, 0.7668],
  },
  "column-fallen-v": {
    kit: "v3",
    frame: [1719, 1655, 186, 125],
    world: [82.5, 55.25],
    pivot: [0.4945, 0.5742],
    heightM: 0.5,
    footprintM: [0.7, 2.66],
    ground: [0.7783, 0.817, 0.8733, 0.914, 0.9038, 0.8552, 0.7992, 0.7692, 0.7059, 0.6787, 0.6335, 0.5837, 0.5158, 0.4706, 0.4299, 0.3801, 0.3801],
  },
  "grave-headstone": {
    kit: "v3",
    frame: [558, 1655, 166, 207],
    world: [73.5, 91.5],
    pivot: [0.4653, 0.7727],
    heightM: 1.59,
    footprintM: [1.08, 1.68],
    ground: [0.8087, 0.826, 0.8487, 0.8741, 0.9044, 0.9235, 0.9481, 0.9339, 0.9057, 0.8885, 0.8607, 0.8321, 0.806, 0.7813, 0.7558, 0.7322, 0.7322],
  },
  "grave-cross": {
    kit: "v3",
    frame: [1724, 1418, 166, 223],
    world: [73.5, 98.75],
    pivot: [0.4653, 0.7894],
    heightM: 1.84,
    footprintM: [1.08, 1.68],
    ground: [0.8203, 0.8388, 0.8573, 0.8834, 0.9114, 0.9316, 0.9541, 0.9362, 0.9076, 0.8891, 0.8658, 0.8394, 0.8184, 0.7975, 0.7737, 0.7544, 0.7544],
  },
  "grave-sarcophagus": {
    kit: "v3",
    frame: [1092, 1655, 225, 194],
    world: [100, 86.25],
    pivot: [0.4828, 0.6841],
    heightM: 1,
    footprintM: [1.44, 2.52],
    ground: [0.7623, 0.7679, 0.8058, 0.8429, 0.8812, 0.913, 0.9449, 0.904, 0.8812, 0.8451, 0.8, 0.7701, 0.7355, 0.6951, 0.658, 0.6319, 0.6319],
  },
  "grave-memorial": {
    kit: "v3",
    frame: [774, 1059, 321, 322],
    world: [142.25, 142.5],
    pivot: [0.4833, 0.7325],
    heightM: 2.51,
    footprintM: [3, 3],
    ground: [0.7351, 0.7596, 0.7895, 0.8211, 0.8544, 0.8825, 0.9158, 0.9439, 0.9596, 0.9281, 0.8982, 0.8684, 0.8386, 0.807, 0.7719, 0.7447, 0.7298],
  },
  "temple-podium": {
    kit: "v3",
    frame: [875, 0, 855, 493],
    world: [380, 219],
    pivot: [0.4999, 0.5645],
    heightM: 1.0541666666666667,
    footprintM: [5.874, 11.874],
    ground: [0.7123, 0.7628, 0.8174, 0.8715, 0.9254, 0.9801, 0.9587, 0.9041, 0.8501, 0.796, 0.7414, 0.6879, 0.6332, 0.5792, 0.5251, 0.4706, 0.4201],
  },
};

export const DEFAULT_FRONTIER_KIT: Record<string, FrontierKitItem> = {
  "temple-podium": { layer: "ground", block: [] },
  "wall-ne": { layer: "upright", block: [[-0.28, -1.12, 0, 0.95]] },
  "wall-se": { layer: "upright", block: [[-1.18, -0.28, 0.95, 0]] },
  "corner-n": {
    layer: "upright",
    block: [
      [-0.8, 0.02, 0.31, 0.31],
      [0.02, -0.8, 0.31, 0.31],
    ],
  },
  "corner-s": {
    layer: "upright",
    block: [
      [-0.77, 0.05, 0.34, 0.34],
      [0.05, -0.77, 0.34, 0.34],
    ],
  },
  "arch-ne": {
    layer: "upright",
    block: [
      [-0.42, 0.36, -0.02, 0.86],
      [-0.04, -0.78, 0.36, -0.33],
    ],
  },
  "arch-se": {
    layer: "upright",
    block: [
      [-0.95, -0.22, -0.5, 0.22],
      [0.48, -0.27, 0.92, 0.17],
    ],
  },
  "pillar-intact": { layer: "upright", block: [[-0.15, -0.15, 0.15, 0.15]] },
  "pillar-broken": { layer: "upright", block: [[-0.15, -0.15, 0.15, 0.15]] },
  "stairs-ne": { layer: "upright", block: [[-0.28, -0.42, 0.28, 0.42]] },
  "stairs-nw": {
    layer: "upright",
    block: [
      [-0.3, -0.6, 0.3, -0.49],
      [-0.3, 0.49, 0.3, 0.6],
    ],
  },
  foundation: { layer: "ground", block: [] },
  paving: { layer: "ground", block: [] },
  rubble: { layer: "upright", block: [[-0.3, -0.22, 0.3, 0.22]] },
  "ruined-gate": {
    layer: "upright",
    block: [
      [-1.35, -0.3, -0.65, 0.3],
      [0.35, -0.7, 1, -0.1],
    ],
  },
  "broken-watchtower": {
    layer: "upright",
    block: [
      [-1.94, -1.38, 0.06, -0.08],
      [-1.59, -1.73, -0.29, 0.27],
    ],
  },
  "snowy-shrine": {
    layer: "upright",
    block: [
      [-0.74, -0.53, 0.26, 0.13],
      [-0.57, -0.7, 0.09, 0.3],
    ],
  },
  "pine-tall": { layer: "upright", block: [[-0.2, -0.2, 0.2, 0.2]] },
  "pine-broad": { layer: "upright", block: [[-0.3, -0.3, 0.3, 0.3]] },
  "pine-sapling": { layer: "upright", block: [[-0.08, -0.08, 0.08, 0.08]] },
  "dead-tree": { layer: "upright", block: [[-0.18, -0.18, 0.18, 0.18]] },
  "dead-snag": { layer: "upright", block: [[-0.12, -0.12, 0.12, 0.12]] },
  "shrub-juniper": { layer: "upright", block: [] },
  "shrub-twigs": { layer: "upright", block: [] },
  "grass-tussock": { layer: "upright", block: [] },
  "grass-patch": { layer: "ground", block: [], band: "over" },
  "rock-boulders": {
    layer: "upright",
    block: [
      [-0.5, 0.1, -0.1, 0.5],
      [-0.25, -0.25, 0.25, 0.25],
      [0.12, -0.48, 0.48, -0.12],
    ],
  },
  "rock-scatter": { layer: "ground", block: [], band: "over" },
  "floor-sunk": { layer: "ground", block: [] },
  "flagstones-a": { layer: "ground", block: [] },
  "flagstones-b": { layer: "ground", block: [] },
  "flagstones-c": { layer: "ground", block: [] },
  "flagstones-d": { layer: "ground", block: [] },
  "stone-chips-a": { layer: "ground", block: [], band: "over" },
  "stone-chips-b": { layer: "ground", block: [], band: "over" },
  "ground-scuff-a": { layer: "ground", block: [], band: "under" },
  "ground-scuff-b": { layer: "ground", block: [], band: "under" },
  "drift-ne": { layer: "upright", block: [] },
  "drift-se": { layer: "upright", block: [] },
  "drift-mound": { layer: "upright", block: [] },
  "column-fallen": { layer: "upright", block: [[-0.42, -0.11, 0.47, 0.12]] },
  "column-fallen-v": { layer: "upright", block: [[-0.11, -0.42, 0.12, 0.47]] },
  "grave-headstone": { layer: "upright", block: [[-0.18, -0.28, 0.18, 0.28]] },
  "grave-cross": { layer: "upright", block: [[-0.18, -0.28, 0.18, 0.28]] },
  "grave-sarcophagus": { layer: "upright", block: [[-0.25, -0.43, 0.25, 0.43]] },
  "grave-memorial": { layer: "upright", block: [[-0.5, -0.5, 0.5, 0.5]] },
};

export const DEFAULT_FRONTIER_PLACEMENTS: FrontierPlacement[] = [{"a":"ground-scuff-a","u":478.11,"v":478.16,"s":0.717,"r":319,"zone":"Frontier road"},{"a":"ground-scuff-a","u":478.65,"v":478.66,"s":0.735,"f":1,"r":187,"zone":"Frontier road"},{"a":"ground-scuff-b","u":479.23,"v":479.12,"s":0.804,"r":247,"zone":"Frontier road"},{"a":"ground-scuff-a","u":479.69,"v":479.75,"s":0.609,"r":189,"zone":"Frontier road"},{"a":"ground-scuff-b","u":480.11,"v":480.27,"s":0.717,"r":169,"zone":"Frontier road"},{"a":"ground-scuff-a","u":480.59,"v":480.93,"s":0.844,"f":1,"r":5,"zone":"Frontier road"},{"a":"ground-scuff-a","u":480.88,"v":481.73,"s":0.758,"r":17,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.26,"v":482.29,"s":0.751,"r":266,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.53,"v":483.11,"s":0.626,"f":1,"r":290,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.29,"v":483.81,"s":0.729,"r":125,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.35,"v":484.5,"s":0.731,"f":1,"r":287,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.37,"v":485.18,"s":0.767,"r":55,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.42,"v":485.89,"s":0.748,"f":1,"r":107,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.41,"v":486.55,"s":0.673,"r":43,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.56,"v":487.19,"s":0.704,"f":1,"r":145,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.74,"v":487.92,"s":0.757,"f":1,"r":15,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.66,"v":488.61,"s":0.759,"r":184,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.55,"v":489.32,"s":0.661,"r":174,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.62,"v":489.96,"s":0.804,"f":1,"r":252,"zone":"Frontier road"},{"a":"ground-scuff-b","u":481.36,"v":490.74,"s":0.712,"f":1,"r":142,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.34,"v":491.56,"s":0.799,"r":80,"zone":"Frontier road"},{"a":"ground-scuff-a","u":481.29,"v":492.31,"s":0.715,"f":1,"r":152,"zone":"Frontier road"},{"a":"flagstones-c","u":477.97,"v":478.01,"s":0.95,"f":1,"r":260,"zone":"Frontier road"},{"a":"flagstones-d","u":478.2,"v":478.31,"s":0.999,"r":341,"zone":"Frontier road"},{"a":"flagstones-a","u":478.4,"v":478.55,"s":1.185,"r":71,"zone":"Frontier road"},{"a":"flagstones-d","u":478.63,"v":478.75,"s":1.073,"r":50,"zone":"Frontier road"},{"a":"flagstones-b","u":478.92,"v":478.91,"s":0.966,"f":1,"r":106,"zone":"Frontier road"},{"a":"flagstones-d","u":479.4,"v":479.33,"s":0.971,"r":252,"zone":"Frontier road"},{"a":"flagstones-c","u":479.55,"v":479.64,"s":1.211,"r":246,"zone":"Frontier road"},{"a":"flagstones-a","u":479.77,"v":479.86,"s":0.976,"r":360,"zone":"Frontier road"},{"a":"flagstones-c","u":479.96,"v":479.98,"s":1.168,"r":96,"zone":"Frontier road"},{"a":"flagstones-a","u":480.13,"v":480.31,"s":0.965,"f":1,"r":63,"zone":"Frontier road"},{"a":"flagstones-a","u":480.36,"v":480.55,"s":1.169,"f":1,"r":291,"zone":"Frontier road"},{"a":"flagstones-c","u":480.57,"v":480.81,"s":0.978,"r":71,"zone":"Frontier road"},{"a":"flagstones-d","u":480.69,"v":481.12,"s":1.047,"r":159,"zone":"Frontier road"},{"a":"flagstones-b","u":480.85,"v":481.42,"s":1.028,"r":281,"zone":"Frontier road"},{"a":"flagstones-a","u":480.99,"v":481.72,"s":1.011,"r":311,"zone":"Frontier road"},{"a":"flagstones-c","u":481.06,"v":482.05,"s":1.07,"r":52,"zone":"Frontier road"},{"a":"flagstones-c","u":481.24,"v":482.38,"s":1.234,"r":322,"zone":"Frontier road"},{"a":"flagstones-c","u":481.49,"v":482.61,"s":0.991,"f":1,"r":74,"zone":"Frontier road"},{"a":"flagstones-c","u":481.43,"v":482.99,"s":1.136,"f":1,"r":62,"zone":"Frontier road"},{"a":"flagstones-d","u":481.5,"v":483.31,"s":1.19,"r":47,"zone":"Frontier road"},{"a":"flagstones-a","u":481.34,"v":484.02,"s":1.06,"r":43,"zone":"Frontier road"},{"a":"flagstones-a","u":481.28,"v":484.4,"s":1.074,"f":1,"r":325,"zone":"Frontier road"},{"a":"flagstones-b","u":481.43,"v":484.75,"s":1.121,"f":1,"r":214,"zone":"Frontier road"},{"a":"flagstones-a","u":481.47,"v":485.09,"s":1.223,"f":1,"r":354,"zone":"Frontier road"},{"a":"flagstones-c","u":481.38,"v":485.46,"s":1.047,"f":1,"r":289,"zone":"Frontier road"},{"a":"flagstones-d","u":481.43,"v":485.81,"s":1.223,"f":1,"r":211,"zone":"Frontier road"},{"a":"flagstones-a","u":481.44,"v":486.14,"s":1.131,"f":1,"r":108,"zone":"Frontier road"},{"a":"flagstones-a","u":481.39,"v":486.5,"s":1.207,"r":138,"zone":"Frontier road"},{"a":"flagstones-a","u":481.52,"v":486.84,"s":1.187,"r":52,"zone":"Frontier road"},{"a":"flagstones-c","u":481.58,"v":487.2,"s":1.132,"f":1,"r":207,"zone":"Frontier road"},{"a":"flagstones-b","u":481.69,"v":487.86,"s":1.217,"f":1,"r":55,"zone":"Frontier road"},{"a":"flagstones-c","u":481.72,"v":488.2,"s":1.037,"r":168,"zone":"Frontier road"},{"a":"flagstones-a","u":481.65,"v":488.5,"s":1.23,"f":1,"r":32,"zone":"Frontier road"},{"a":"flagstones-a","u":481.57,"v":488.87,"s":1.208,"f":1,"r":173,"zone":"Frontier road"},{"a":"flagstones-a","u":481.57,"v":489.2,"s":0.965,"f":1,"r":118,"zone":"Frontier road"},{"a":"flagstones-a","u":481.62,"v":489.55,"s":1.242,"f":1,"r":115,"zone":"Frontier road"},{"a":"flagstones-c","u":481.6,"v":489.89,"s":1.031,"f":1,"r":17,"zone":"Frontier road"},{"a":"flagstones-b","u":481.39,"v":490.54,"s":1.125,"f":1,"r":279,"zone":"Frontier road"},{"a":"flagstones-a","u":481.28,"v":490.84,"s":1.084,"r":327,"zone":"Frontier road"},{"a":"flagstones-b","u":481.22,"v":491.2,"s":1.136,"f":1,"r":245,"zone":"Frontier road"},{"a":"flagstones-a","u":481.3,"v":491.55,"s":0.984,"r":0,"zone":"Frontier road"},{"a":"flagstones-d","u":481.3,"v":491.87,"s":1.234,"r":183,"zone":"Frontier road"},{"a":"flagstones-c","u":481.26,"v":492.19,"s":1.031,"r":129,"zone":"Frontier road"},{"a":"flagstones-d","u":481.28,"v":492.52,"s":1.077,"r":306,"zone":"Frontier road"},{"a":"flagstones-d","u":481.15,"v":492.83,"s":1.121,"r":347,"zone":"Frontier road"},{"a":"stone-chips-a","u":478.64,"v":477.83,"s":0.977,"r":82,"zone":"Frontier road"},{"a":"grass-tussock","u":478.36,"v":479.66,"s":0.808,"zone":"Frontier road"},{"a":"grass-tussock","u":480.34,"v":478.94,"s":0.841,"f":1,"zone":"Frontier road"},{"a":"stone-chips-b","u":479.73,"v":480.77,"s":1.042,"r":210,"zone":"Frontier road"},{"a":"stone-chips-a","u":481.39,"v":481.17,"s":0.929,"f":1,"r":315,"zone":"Frontier road"},{"a":"grass-patch","u":481.94,"v":482.7,"s":0.828,"zone":"Frontier road"},{"a":"stone-chips-a","u":482.09,"v":483.65,"s":1.108,"f":1,"r":48,"zone":"Frontier road"},{"a":"stone-chips-b","u":482.16,"v":485.15,"s":0.841,"r":21,"zone":"Frontier road"},{"a":"grass-patch","u":482.25,"v":486.52,"s":0.66,"f":1,"zone":"Frontier road"},{"a":"stone-chips-a","u":482.08,"v":487.68,"s":0.813,"f":1,"r":277,"zone":"Frontier road"},{"a":"rock-scatter","u":482.17,"v":488.42,"s":0.919,"f":1,"zone":"Frontier road"},{"a":"stone-chips-b","u":482.26,"v":489.23,"s":1.187,"r":341,"zone":"Frontier road"},{"a":"grass-tussock","u":482.36,"v":490.22,"s":0.876,"f":1,"zone":"Frontier road"},{"a":"grass-patch","u":480.82,"v":491.07,"s":0.886,"f":1,"zone":"Frontier road"},{"a":"ground-scuff-b","u":480.33,"v":479.99,"s":0.747,"f":1,"r":355,"zone":"Watch road"},{"a":"ground-scuff-b","u":481.04,"v":479.59,"s":0.728,"r":223,"zone":"Watch road"},{"a":"ground-scuff-b","u":481.69,"v":479.33,"s":0.698,"f":1,"r":36,"zone":"Watch road"},{"a":"ground-scuff-a","u":482.37,"v":479.13,"s":0.632,"r":50,"zone":"Watch road"},{"a":"ground-scuff-a","u":483.18,"v":478.96,"s":0.714,"r":274,"zone":"Watch road"},{"a":"ground-scuff-b","u":483.92,"v":478.99,"s":0.828,"f":1,"r":99,"zone":"Watch road"},{"a":"ground-scuff-b","u":484.61,"v":478.93,"s":0.741,"r":11,"zone":"Watch road"},{"a":"ground-scuff-b","u":485.25,"v":478.93,"s":0.767,"f":1,"r":256,"zone":"Watch road"},{"a":"ground-scuff-a","u":486.03,"v":478.57,"s":0.785,"r":241,"zone":"Watch road"},{"a":"ground-scuff-b","u":486.75,"v":478.33,"s":0.83,"f":1,"r":33,"zone":"Watch road"},{"a":"ground-scuff-b","u":487.36,"v":478.04,"s":0.68,"r":102,"zone":"Watch road"},{"a":"ground-scuff-b","u":488.15,"v":477.78,"s":0.719,"r":225,"zone":"Watch road"},{"a":"ground-scuff-b","u":488.98,"v":477.63,"s":0.75,"r":28,"zone":"Watch road"},{"a":"ground-scuff-a","u":489.69,"v":477.59,"s":0.827,"f":1,"r":166,"zone":"Watch road"},{"a":"flagstones-b","u":480.13,"v":480.02,"s":1.041,"r":245,"zone":"Watch road"},{"a":"flagstones-c","u":480.46,"v":479.87,"s":1.109,"r":28,"zone":"Watch road"},{"a":"flagstones-d","u":480.73,"v":479.7,"s":1.148,"f":1,"r":100,"zone":"Watch road"},{"a":"flagstones-c","u":481.04,"v":479.53,"s":1.198,"f":1,"r":226,"zone":"Watch road"},{"a":"flagstones-c","u":481.42,"v":479.47,"s":1.113,"f":1,"r":232,"zone":"Watch road"},{"a":"flagstones-c","u":481.7,"v":479.28,"s":1.077,"f":1,"r":242,"zone":"Watch road"},{"a":"flagstones-a","u":482.06,"v":479.25,"s":1.237,"r":107,"zone":"Watch road"},{"a":"flagstones-b","u":482.38,"v":479.23,"s":1.043,"f":1,"r":308,"zone":"Watch road"},{"a":"flagstones-b","u":482.72,"v":479.13,"s":1.05,"r":42,"zone":"Watch road"},{"a":"flagstones-a","u":483.06,"v":478.94,"s":1.245,"f":1,"r":206,"zone":"Watch road"},{"a":"flagstones-a","u":483.43,"v":478.87,"s":1.233,"r":122,"zone":"Watch road"},{"a":"flagstones-c","u":483.81,"v":478.9,"s":1.043,"f":1,"r":280,"zone":"Watch road"},{"a":"flagstones-b","u":484.15,"v":478.98,"s":0.982,"r":292,"zone":"Watch road"},{"a":"flagstones-c","u":484.51,"v":478.99,"s":1.235,"f":1,"r":264,"zone":"Watch road"},{"a":"flagstones-d","u":484.88,"v":478.95,"s":1.24,"f":1,"r":345,"zone":"Watch road"},{"a":"flagstones-c","u":485.21,"v":478.93,"s":1.04,"r":37,"zone":"Watch road"},{"a":"flagstones-a","u":485.55,"v":478.78,"s":1.209,"r":358,"zone":"Watch road"},{"a":"flagstones-b","u":485.88,"v":478.61,"s":1.173,"f":1,"r":98,"zone":"Watch road"},{"a":"flagstones-d","u":486.21,"v":478.47,"s":1.16,"f":1,"r":107,"zone":"Watch road"},{"a":"flagstones-c","u":486.52,"v":478.37,"s":0.989,"r":142,"zone":"Watch road"},{"a":"flagstones-b","u":486.87,"v":478.25,"s":1.212,"r":156,"zone":"Watch road"},{"a":"flagstones-c","u":487.18,"v":478.1,"s":1.244,"r":230,"zone":"Watch road"},{"a":"flagstones-c","u":487.51,"v":477.96,"s":1.153,"f":1,"r":223,"zone":"Watch road"},{"a":"flagstones-b","u":487.84,"v":477.84,"s":1.221,"r":351,"zone":"Watch road"},{"a":"flagstones-b","u":488.11,"v":477.66,"s":0.958,"f":1,"r":35,"zone":"Watch road"},{"a":"flagstones-a","u":488.43,"v":477.66,"s":1.232,"r":194,"zone":"Watch road"},{"a":"flagstones-d","u":488.79,"v":477.71,"s":1,"r":341,"zone":"Watch road"},{"a":"flagstones-d","u":489.12,"v":477.63,"s":1.052,"f":1,"r":77,"zone":"Watch road"},{"a":"flagstones-d","u":489.45,"v":477.6,"s":1.118,"f":1,"r":344,"zone":"Watch road"},{"a":"rock-scatter","u":480.71,"v":480.59,"s":0.666,"zone":"Watch road"},{"a":"grass-patch","u":481.57,"v":478.81,"s":0.859,"zone":"Watch road"},{"a":"stone-chips-b","u":482.68,"v":478.55,"s":0.944,"r":140,"zone":"Watch road"},{"a":"grass-patch","u":483.74,"v":479.64,"s":0.731,"f":1,"zone":"Watch road"},{"a":"grass-tussock","u":484.85,"v":477.86,"s":0.815,"zone":"Watch road"},{"a":"stone-chips-a","u":485.79,"v":478.05,"s":1.039,"f":1,"r":82,"zone":"Watch road"},{"a":"grass-tussock","u":486.77,"v":477.42,"s":1.069,"f":1,"zone":"Watch road"},{"a":"grass-patch","u":488.01,"v":478.57,"s":0.729,"zone":"Watch road"},{"a":"grass-patch","u":488.86,"v":477.02,"s":0.879,"zone":"Watch road"},{"a":"ground-scuff-a","u":477.87,"v":478.33,"s":0.848,"f":1,"r":254,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":477.28,"v":478.89,"s":0.8,"f":1,"r":109,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":476.87,"v":479.35,"s":0.698,"r":140,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":476.44,"v":479.9,"s":0.696,"f":1,"r":359,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":475.88,"v":480.36,"s":0.816,"r":170,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":475.32,"v":480.74,"s":0.682,"f":1,"r":332,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":474.79,"v":481.13,"s":0.662,"r":68,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":474.04,"v":481.38,"s":0.755,"r":48,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":473.43,"v":481.62,"s":0.752,"f":1,"r":155,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":472.74,"v":481.96,"s":0.66,"r":60,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":471.92,"v":482,"s":0.738,"r":242,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":471.32,"v":481.74,"s":0.726,"f":1,"r":8,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":470.6,"v":481.72,"s":0.835,"f":1,"r":243,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":469.97,"v":481.83,"s":0.779,"r":130,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":464.14,"v":481.78,"s":0.775,"f":1,"r":94,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":462.09,"v":482.9,"s":0.842,"r":253,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":461.92,"v":483.56,"s":0.679,"r":76,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":461.59,"v":484.16,"s":0.803,"r":149,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":461.4,"v":484.81,"s":0.717,"f":1,"r":177,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":461.14,"v":485.39,"s":0.776,"r":94,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":461.57,"v":486,"s":0.704,"f":1,"r":87,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":462.04,"v":486.51,"s":0.775,"f":1,"r":135,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":465.26,"v":489.08,"s":0.668,"r":248,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":465.47,"v":489.68,"s":0.839,"f":1,"r":348,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":465.6,"v":490.35,"s":0.703,"r":296,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":465.84,"v":491.09,"s":0.829,"r":232,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":465.61,"v":491.68,"s":0.761,"r":122,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":465.43,"v":492.34,"s":0.658,"r":191,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":465.22,"v":493.02,"s":0.723,"r":120,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":464.79,"v":493.54,"s":0.753,"f":1,"r":90,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":464.31,"v":493.92,"s":0.768,"r":324,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":463.8,"v":494.33,"s":0.828,"r":184,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":463.35,"v":494.8,"s":0.652,"f":1,"r":172,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":462.62,"v":494.88,"s":0.699,"r":84,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":462.03,"v":494.65,"s":0.684,"r":345,"zone":"Shrine trail"},{"a":"ground-scuff-b","u":461.97,"v":493.87,"s":0.774,"f":1,"r":207,"zone":"Shrine trail"},{"a":"ground-scuff-a","u":462.02,"v":493.14,"s":0.607,"f":1,"r":126,"zone":"Shrine trail"},{"a":"flagstones-a","u":477.98,"v":478.17,"s":1.094,"r":30,"zone":"Shrine trail"},{"a":"flagstones-b","u":477.8,"v":478.49,"s":1.151,"f":1,"r":53,"zone":"Shrine trail"},{"a":"flagstones-a","u":477.58,"v":478.7,"s":0.991,"f":1,"r":54,"zone":"Shrine trail"},{"a":"flagstones-c","u":477.29,"v":478.87,"s":1.005,"r":288,"zone":"Shrine trail"},{"a":"flagstones-d","u":477.06,"v":479.09,"s":1.089,"f":1,"r":55,"zone":"Shrine trail"},{"a":"flagstones-d","u":476.87,"v":479.41,"s":1.15,"f":1,"r":139,"zone":"Shrine trail"},{"a":"flagstones-c","u":476.68,"v":479.65,"s":1.1,"r":211,"zone":"Shrine trail"},{"a":"flagstones-c","u":476.45,"v":479.86,"s":1.182,"f":1,"r":230,"zone":"Shrine trail"},{"a":"flagstones-a","u":476.16,"v":480.03,"s":1.249,"r":52,"zone":"Shrine trail"},{"a":"flagstones-d","u":475.91,"v":480.29,"s":1.063,"f":1,"r":56,"zone":"Shrine trail"},{"a":"flagstones-d","u":475.6,"v":480.47,"s":1.191,"r":333,"zone":"Shrine trail"},{"a":"flagstones-d","u":475.43,"v":480.75,"s":0.998,"f":1,"r":257,"zone":"Shrine trail"},{"a":"flagstones-b","u":475.22,"v":480.88,"s":1.159,"r":60,"zone":"Shrine trail"},{"a":"flagstones-b","u":474.87,"v":481,"s":1.208,"f":1,"r":35,"zone":"Shrine trail"},{"a":"flagstones-d","u":474.58,"v":481.29,"s":1.092,"f":1,"r":330,"zone":"Shrine trail"},{"a":"flagstones-b","u":474.27,"v":481.4,"s":1.031,"f":1,"r":123,"zone":"Shrine trail"},{"a":"flagstones-b","u":473.92,"v":481.4,"s":0.987,"r":112,"zone":"Shrine trail"},{"a":"flagstones-d","u":473.58,"v":481.54,"s":0.985,"r":350,"zone":"Shrine trail"},{"a":"flagstones-b","u":473.24,"v":481.72,"s":1.148,"r":12,"zone":"Shrine trail"},{"a":"flagstones-a","u":472.93,"v":481.88,"s":1.213,"r":142,"zone":"Shrine trail"},{"a":"flagstones-d","u":472.57,"v":481.98,"s":1.193,"f":1,"r":123,"zone":"Shrine trail"},{"a":"flagstones-d","u":472.18,"v":482.01,"s":1.105,"f":1,"r":319,"zone":"Shrine trail"},{"a":"flagstones-d","u":471.8,"v":481.97,"s":1.213,"r":349,"zone":"Shrine trail"},{"a":"flagstones-a","u":471.49,"v":481.88,"s":1.049,"f":1,"r":99,"zone":"Shrine trail"},{"a":"flagstones-b","u":471.15,"v":481.78,"s":1.022,"r":306,"zone":"Shrine trail"},{"a":"flagstones-b","u":470.79,"v":481.76,"s":1.151,"f":1,"r":163,"zone":"Shrine trail"},{"a":"flagstones-d","u":470.47,"v":481.7,"s":1.117,"f":1,"r":242,"zone":"Shrine trail"},{"a":"flagstones-d","u":464.03,"v":481.88,"s":1.201,"r":79,"zone":"Shrine trail"},{"a":"flagstones-b","u":463.73,"v":482.08,"s":1.057,"r":246,"zone":"Shrine trail"},{"a":"flagstones-a","u":462.27,"v":482.84,"s":0.992,"r":222,"zone":"Shrine trail"},{"a":"flagstones-a","u":461.97,"v":482.97,"s":1.127,"r":289,"zone":"Shrine trail"},{"a":"flagstones-a","u":461.98,"v":483.19,"s":1.174,"f":1,"r":193,"zone":"Shrine trail"},{"a":"flagstones-c","u":461.85,"v":483.51,"s":1.199,"f":1,"r":279,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.82,"v":483.88,"s":1.229,"r":11,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.72,"v":484.17,"s":0.964,"r":305,"zone":"Shrine trail"},{"a":"flagstones-c","u":461.43,"v":484.48,"s":1.228,"f":1,"r":265,"zone":"Shrine trail"},{"a":"flagstones-a","u":461.28,"v":484.79,"s":1.11,"r":334,"zone":"Shrine trail"},{"a":"flagstones-a","u":461.28,"v":485.14,"s":1.245,"f":1,"r":127,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.18,"v":485.63,"s":1.109,"f":1,"r":58,"zone":"Shrine trail"},{"a":"flagstones-c","u":461.46,"v":485.83,"s":1.065,"r":81,"zone":"Shrine trail"},{"a":"flagstones-c","u":461.74,"v":486.07,"s":1.169,"r":311,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.93,"v":486.32,"s":1.008,"r":223,"zone":"Shrine trail"},{"a":"flagstones-a","u":462.18,"v":486.51,"s":0.989,"r":219,"zone":"Shrine trail"},{"a":"flagstones-d","u":465.1,"v":488.8,"s":1.246,"r":7,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.32,"v":489.01,"s":1.106,"f":1,"r":147,"zone":"Shrine trail"},{"a":"flagstones-d","u":465.36,"v":489.23,"s":1.159,"r":203,"zone":"Shrine trail"},{"a":"flagstones-d","u":465.47,"v":489.56,"s":1.144,"f":1,"r":26,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.45,"v":489.91,"s":1.104,"r":46,"zone":"Shrine trail"},{"a":"flagstones-c","u":465.59,"v":490.2,"s":1.038,"r":319,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.65,"v":490.54,"s":1.184,"r":295,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.83,"v":490.81,"s":1.147,"f":1,"r":332,"zone":"Shrine trail"},{"a":"flagstones-d","u":465.82,"v":491.19,"s":0.992,"r":199,"zone":"Shrine trail"},{"a":"flagstones-d","u":465.71,"v":491.54,"s":1.022,"f":1,"r":249,"zone":"Shrine trail"},{"a":"flagstones-b","u":465.53,"v":491.83,"s":0.991,"r":87,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.51,"v":492.17,"s":1.153,"r":340,"zone":"Shrine trail"},{"a":"flagstones-b","u":465.36,"v":492.48,"s":0.998,"r":129,"zone":"Shrine trail"},{"a":"flagstones-a","u":465.35,"v":492.86,"s":1.104,"r":2,"zone":"Shrine trail"},{"a":"flagstones-c","u":465.17,"v":493.13,"s":1.047,"f":1,"r":41,"zone":"Shrine trail"},{"a":"flagstones-d","u":464.99,"v":493.5,"s":1.083,"r":182,"zone":"Shrine trail"},{"a":"flagstones-a","u":464.66,"v":493.63,"s":1.216,"f":1,"r":332,"zone":"Shrine trail"},{"a":"flagstones-d","u":464.35,"v":493.79,"s":1.241,"r":264,"zone":"Shrine trail"},{"a":"flagstones-a","u":464.09,"v":494.01,"s":1.091,"f":1,"r":238,"zone":"Shrine trail"},{"a":"flagstones-b","u":463.89,"v":494.28,"s":1.207,"r":320,"zone":"Shrine trail"},{"a":"flagstones-c","u":463.62,"v":494.54,"s":1.01,"f":1,"r":144,"zone":"Shrine trail"},{"a":"flagstones-d","u":463.39,"v":494.77,"s":1.044,"r":234,"zone":"Shrine trail"},{"a":"flagstones-d","u":463.07,"v":494.78,"s":1.094,"r":132,"zone":"Shrine trail"},{"a":"flagstones-a","u":462.73,"v":494.78,"s":0.971,"r":65,"zone":"Shrine trail"},{"a":"flagstones-d","u":462.42,"v":494.85,"s":1.194,"f":1,"r":69,"zone":"Shrine trail"},{"a":"flagstones-d","u":462.08,"v":494.87,"s":1.165,"f":1,"r":125,"zone":"Shrine trail"},{"a":"flagstones-d","u":462.03,"v":494.56,"s":0.975,"r":355,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.99,"v":494.21,"s":1.14,"r":271,"zone":"Shrine trail"},{"a":"flagstones-d","u":461.84,"v":493.87,"s":0.993,"f":1,"r":165,"zone":"Shrine trail"},{"a":"flagstones-a","u":461.92,"v":493.54,"s":0.972,"f":1,"r":265,"zone":"Shrine trail"},{"a":"flagstones-b","u":461.95,"v":493.17,"s":1.2,"f":1,"r":126,"zone":"Shrine trail"},{"a":"grass-tussock","u":478.27,"v":478.94,"s":0.821,"f":1,"zone":"Shrine trail"},{"a":"stone-chips-b","u":477.3,"v":479.83,"s":1.156,"r":316,"zone":"Shrine trail"},{"a":"stone-chips-b","u":475.65,"v":479.67,"s":1.016,"f":1,"r":84,"zone":"Shrine trail"},{"a":"rock-scatter","u":475.43,"v":481.63,"s":0.713,"zone":"Shrine trail"},{"a":"grass-patch","u":474.48,"v":481.95,"s":0.749,"zone":"Shrine trail"},{"a":"grass-tussock","u":473.21,"v":480.74,"s":1.076,"zone":"Shrine trail"},{"a":"grass-patch","u":472.18,"v":481.13,"s":0.912,"f":1,"zone":"Shrine trail"},{"a":"grass-patch","u":471.3,"v":482.55,"s":0.658,"f":1,"zone":"Shrine trail"},{"a":"grass-tussock","u":469.1,"v":480.99,"s":1.011,"zone":"Shrine trail"},{"a":"grass-patch","u":463.17,"v":481.62,"s":0.873,"f":1,"zone":"Shrine trail"},{"a":"stone-chips-b","u":462.42,"v":482.06,"s":1.057,"r":147,"zone":"Shrine trail"},{"a":"grass-tussock","u":461.06,"v":483.26,"s":0.753,"zone":"Shrine trail"},{"a":"stone-chips-b","u":460.92,"v":484.44,"s":0.966,"r":182,"zone":"Shrine trail"},{"a":"stone-chips-a","u":461.07,"v":486.21,"s":0.86,"f":1,"r":311,"zone":"Shrine trail"},{"a":"grass-tussock","u":464.44,"v":489.4,"s":0.981,"f":1,"zone":"Shrine trail"},{"a":"grass-tussock","u":466.3,"v":489.16,"s":1.012,"zone":"Shrine trail"},{"a":"rock-scatter","u":464.99,"v":490.42,"s":0.746,"zone":"Shrine trail"},{"a":"rock-scatter","u":465.13,"v":490.86,"s":0.711,"zone":"Shrine trail"},{"a":"stone-chips-b","u":465.99,"v":492.3,"s":1.181,"f":1,"r":80,"zone":"Shrine trail"},{"a":"stone-chips-a","u":465.47,"v":493.79,"s":1.031,"f":1,"r":164,"zone":"Shrine trail"},{"a":"rock-scatter","u":463.6,"v":493.79,"s":0.918,"zone":"Shrine trail"},{"a":"stone-chips-a","u":462.8,"v":494.21,"s":0.839,"r":197,"zone":"Shrine trail"},{"a":"stone-chips-a","u":461.38,"v":494.56,"s":0.89,"f":1,"r":148,"zone":"Shrine trail"},{"a":"rock-scatter","u":461.41,"v":493.63,"s":0.834,"f":1,"zone":"Shrine trail"},{"a":"ruined-gate","u":481.65,"v":486.25,"zone":"Ruined gate"},{"a":"wall-se","u":483.83,"v":486.05,"zone":"Ruined gate"},{"a":"rubble","u":485.25,"v":485.75,"s":1.091,"zone":"Ruined gate"},{"a":"stone-chips-a","u":485.7,"v":486.25,"s":1.098,"r":104,"zone":"Ruined gate"},{"a":"drift-se","u":484,"v":486.42,"s":0.978,"f":1,"zone":"Ruined gate"},{"a":"grass-tussock","u":483.2,"v":486.55,"s":0.865,"f":1,"zone":"Ruined gate"},{"a":"shrub-twigs","u":485.8,"v":485.1,"s":0.84,"f":1,"zone":"Ruined gate"},{"a":"wall-se","u":479,"v":486.45,"zone":"Ruined gate"},{"a":"stone-chips-b","u":480.1,"v":486.85,"s":0.922,"f":1,"r":204,"zone":"Ruined gate"},{"a":"drift-mound","u":478.7,"v":486.75,"s":0.937,"f":1,"zone":"Ruined gate"},{"a":"grass-patch","u":478.1,"v":486.6,"s":0.992,"f":1,"r":4,"zone":"Ruined gate"},{"a":"drift-mound","u":482.45,"v":486.7,"s":0.712,"f":1,"zone":"Ruined gate"},{"a":"rock-boulders","u":484.1,"v":483.9,"s":0.85,"zone":"Ruined gate"},{"a":"dead-snag","u":478.2,"v":483.6,"zone":"Ruined gate"},{"a":"ground-scuff-a","u":479,"v":492.5,"s":1.15,"r":20,"zone":"Temple"},{"a":"temple-podium","u":478.9,"v":492.5,"zone":"Temple"},{"a":"stairs-nw","u":480.18,"v":492.5,"zone":"Temple"},{"a":"pillar-intact","u":478.12,"v":490.7,"s":1.06,"lift":25,"zone":"Temple"},{"a":"pillar-intact","u":478.12,"v":491.6,"s":1.06,"lift":25,"zone":"Temple"},{"a":"pillar-broken","u":478.12,"v":493.4,"lift":25,"zone":"Temple"},{"a":"pillar-intact","u":478.12,"v":494.3,"s":1.06,"lift":25,"zone":"Temple"},{"a":"pillar-intact","u":479.68,"v":490.7,"s":1.06,"lift":25,"zone":"Temple"},{"a":"pillar-broken","u":479.68,"v":491.55,"lift":25,"zone":"Temple"},{"a":"pillar-intact","u":479.68,"v":493.45,"s":1.06,"lift":25,"zone":"Temple"},{"a":"pillar-intact","u":479.68,"v":494.3,"s":1.06,"lift":25,"zone":"Temple"},{"a":"column-fallen","u":478.85,"v":493.8,"lift":25,"zone":"Temple"},{"a":"column-fallen-v","u":480.45,"v":490.65,"zone":"Temple"},{"a":"rubble","u":477.5,"v":493,"s":0.848,"zone":"Temple"},{"a":"stone-chips-a","u":480.8,"v":491.5,"s":0.994,"f":1,"r":155,"zone":"Temple"},{"a":"stone-chips-b","u":480.1,"v":495.1,"s":0.975,"r":12,"zone":"Temple"},{"a":"drift-mound","u":477.8,"v":495.1,"s":1.002,"zone":"Temple"},{"a":"grass-tussock","u":477.45,"v":491.6,"s":1.035,"f":1,"zone":"Temple"},{"a":"shrub-juniper","u":477.6,"v":495.4,"s":0.734,"f":1,"zone":"Temple"},{"a":"grass-patch","u":480.8,"v":493.9,"s":0.959,"f":1,"r":74,"zone":"Temple"},{"a":"grass-tussock","u":480.4,"v":495.25,"s":0.787,"f":1,"zone":"Temple"},{"a":"ground-scuff-a","u":474.7,"v":492.6,"r":-15,"zone":"Settlement"},{"a":"floor-sunk","u":474.75,"v":492.45,"s":1.38,"zone":"Settlement"},{"a":"wall-ne","u":473.5,"v":491.94,"zone":"Settlement"},{"a":"wall-se","u":474.4,"v":491.1,"zone":"Settlement"},{"a":"arch-ne","u":476.12,"v":492,"zone":"Settlement"},{"a":"corner-n","u":476,"v":493.8,"zone":"Settlement"},{"a":"rubble","u":474.1,"v":494.05,"s":0.962,"zone":"Settlement"},{"a":"stone-chips-a","u":473.4,"v":493.5,"s":0.924,"f":1,"r":175,"zone":"Settlement"},{"a":"stone-chips-b","u":474.9,"v":494.35,"s":1.07,"f":1,"r":208,"zone":"Settlement"},{"a":"drift-ne","u":473.75,"v":493.05,"s":0.872,"f":1,"zone":"Settlement"},{"a":"drift-se","u":475.1,"v":491.35,"s":0.809,"zone":"Settlement"},{"a":"drift-mound","u":476.45,"v":493.4,"s":0.77,"zone":"Settlement"},{"a":"grass-tussock","u":473.1,"v":490.8,"s":0.983,"zone":"Settlement"},{"a":"shrub-twigs","u":472.8,"v":493.1,"s":0.877,"f":1,"zone":"Settlement"},{"a":"grass-patch","u":475.4,"v":492.9,"s":0.738,"r":135,"zone":"Settlement"},{"a":"grass-tussock","u":476.5,"v":491.25,"s":0.672,"f":1,"zone":"Settlement"},{"a":"ground-scuff-a","u":486.8,"v":491.6,"f":1,"r":35,"zone":"Settlement"},{"a":"floor-sunk","u":486.85,"v":491.6,"s":1.35,"f":1,"zone":"Settlement"},{"a":"wall-ne","u":485.4,"v":491.04,"zone":"Settlement"},{"a":"wall-se","u":486.3,"v":490.2,"zone":"Settlement"},{"a":"arch-se","u":486.5,"v":492.95,"zone":"Settlement"},{"a":"corner-s","u":488.25,"v":493,"zone":"Settlement"},{"a":"rubble","u":487.75,"v":490.15,"s":0.945,"zone":"Settlement"},{"a":"rubble","u":488.6,"v":491.3,"s":0.784,"zone":"Settlement"},{"a":"rubble","u":485.25,"v":492.35,"s":0.691,"zone":"Settlement"},{"a":"stone-chips-a","u":488.9,"v":492.1,"s":0.924,"r":216,"zone":"Settlement"},{"a":"stone-chips-b","u":485.8,"v":493.5,"s":1.094,"r":144,"zone":"Settlement"},{"a":"drift-ne","u":485.65,"v":492,"s":0.715,"zone":"Settlement"},{"a":"drift-se","u":487.3,"v":490.45,"s":0.871,"f":1,"zone":"Settlement"},{"a":"pillar-broken","u":489,"v":489.9,"s":1.076,"zone":"Settlement"},{"a":"grass-tussock","u":489.25,"v":493.1,"s":0.991,"zone":"Settlement"},{"a":"shrub-juniper","u":484.8,"v":490.1,"s":0.751,"f":1,"zone":"Settlement"},{"a":"grass-patch","u":487.4,"v":492,"s":0.782,"f":1,"r":70,"zone":"Settlement"},{"a":"grass-tussock","u":484.9,"v":493.3,"s":0.788,"f":1,"zone":"Settlement"},{"a":"broken-watchtower","u":490.9,"v":475.9,"zone":"Watchtower"},{"a":"stairs-ne","u":490.7,"v":476.59,"zone":"Watchtower"},{"a":"wall-ne","u":491.25,"v":476.35,"zone":"Watchtower"},{"a":"wall-ne","u":491.5,"v":478.85,"zone":"Watchtower"},{"a":"corner-n","u":491.8,"v":480.85,"zone":"Watchtower"},{"a":"stone-chips-a","u":491.95,"v":477.7,"s":1.005,"r":320,"zone":"Watchtower"},{"a":"rubble","u":490.5,"v":480.95,"s":0.814,"zone":"Watchtower"},{"a":"stone-chips-b","u":489.9,"v":481.1,"s":1.059,"f":1,"r":205,"zone":"Watchtower"},{"a":"drift-ne","u":491.7,"v":479.5,"s":0.763,"zone":"Watchtower"},{"a":"drift-mound","u":489.5,"v":477.35,"s":0.675,"zone":"Watchtower"},{"a":"rock-boulders","u":493.5,"v":476.9,"s":1.047,"zone":"Watchtower"},{"a":"grass-tussock","u":492.4,"v":479.1,"s":1.069,"f":1,"zone":"Watchtower"},{"a":"shrub-twigs","u":492.7,"v":475.5,"s":0.831,"zone":"Watchtower"},{"a":"grass-patch","u":490.8,"v":479.4,"s":0.908,"r":283,"zone":"Watchtower"},{"a":"grass-tussock","u":492.25,"v":481.3,"s":0.751,"zone":"Watchtower"},{"a":"dead-snag","u":487.1,"v":481.1,"zone":"Watchtower"},{"a":"snowy-shrine","u":462.1,"v":491.1,"zone":"Snowy shrine"},{"a":"ground-scuff-a","u":462.28,"v":492.33,"s":0.9,"r":45,"zone":"Snowy shrine"},{"a":"paving","u":462.08,"v":492.16,"s":0.95,"zone":"Snowy shrine"},{"a":"pillar-intact","u":461.28,"v":492.78,"zone":"Snowy shrine"},{"a":"pillar-intact","u":462.88,"v":492.78,"zone":"Snowy shrine"},{"a":"pillar-intact","u":461.28,"v":493.58,"zone":"Snowy shrine"},{"a":"pillar-broken","u":462.88,"v":493.58,"zone":"Snowy shrine"},{"a":"column-fallen-v","u":460.58,"v":493.28,"zone":"Snowy shrine"},{"a":"stone-chips-b","u":465.1,"v":489.9,"s":1.045,"r":328,"zone":"Snowy shrine"},{"a":"drift-mound","u":460.4,"v":492.7,"s":0.866,"f":1,"zone":"Snowy shrine"},{"a":"shrub-juniper","u":459.9,"v":491.9,"s":1.031,"zone":"Snowy shrine"},{"a":"shrub-juniper","u":465.1,"v":488.9,"s":0.776,"zone":"Snowy shrine"},{"a":"grass-tussock","u":460.9,"v":493.4,"s":1.015,"f":1,"zone":"Snowy shrine"},{"a":"dead-tree","u":465.8,"v":494.4,"s":1.061,"f":1,"zone":"Snowy shrine"},{"a":"grass-patch","u":463.9,"v":491.4,"s":0.763,"r":345,"zone":"Snowy shrine"},{"a":"rock-scatter","u":461.1,"v":489.8,"s":0.915,"r":327,"zone":"Snowy shrine"},{"a":"ground-scuff-a","u":484.74,"v":495.01,"s":0.848,"f":1,"r":254,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":485.35,"v":495.52,"s":0.8,"f":1,"r":109,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":485.87,"v":495.87,"s":0.698,"r":140,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":486.46,"v":496.24,"s":0.696,"f":1,"r":359,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":486.98,"v":496.74,"s":0.816,"r":170,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":487.67,"v":497.24,"s":0.682,"f":1,"r":332,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":488.32,"v":497.1,"s":0.662,"r":68,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":489.1,"v":497.21,"s":0.755,"r":48,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":489.76,"v":497.25,"s":0.752,"f":1,"r":155,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":490.52,"v":497.25,"s":0.66,"r":60,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":491.31,"v":497.36,"s":0.738,"r":242,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":491.76,"v":497.83,"s":0.726,"f":1,"r":8,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":492.35,"v":498.23,"s":0.835,"f":1,"r":243,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":492.94,"v":498.47,"s":0.779,"r":130,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":493.58,"v":498.93,"s":0.662,"r":138,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":494.2,"v":499.24,"s":0.701,"r":274,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.73,"v":499.91,"s":0.635,"r":200,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.51,"v":500.67,"s":0.608,"f":1,"r":166,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.54,"v":501.3,"s":0.841,"r":266,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.57,"v":501.96,"s":0.758,"r":153,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":494.44,"v":502.66,"s":0.655,"r":135,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.26,"v":503.41,"s":0.775,"f":1,"r":94,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":494.49,"v":504.25,"s":0.839,"r":318,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.54,"v":505.02,"s":0.611,"r":283,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.57,"v":505.72,"s":0.842,"r":253,"zone":"Cemetery approach"},{"a":"ground-scuff-a","u":494.67,"v":506.53,"s":0.679,"r":76,"zone":"Cemetery approach"},{"a":"flagstones-c","u":484.88,"v":495.1,"s":1.047,"f":1,"r":283,"zone":"Cemetery approach"},{"a":"flagstones-a","u":485.12,"v":495.34,"s":1.007,"r":10,"zone":"Cemetery approach"},{"a":"flagstones-a","u":485.36,"v":495.56,"s":1.195,"f":1,"r":150,"zone":"Cemetery approach"},{"a":"flagstones-b","u":485.61,"v":495.76,"s":1.16,"f":1,"r":135,"zone":"Cemetery approach"},{"a":"flagstones-c","u":485.95,"v":495.83,"s":1.162,"r":115,"zone":"Cemetery approach"},{"a":"flagstones-c","u":486.18,"v":496.07,"s":1.115,"f":1,"r":7,"zone":"Cemetery approach"},{"a":"flagstones-c","u":486.46,"v":496.27,"s":1.073,"f":1,"r":211,"zone":"Cemetery approach"},{"a":"flagstones-a","u":486.67,"v":496.61,"s":0.958,"f":1,"r":186,"zone":"Cemetery approach"},{"a":"flagstones-a","u":486.95,"v":496.79,"s":1.024,"r":98,"zone":"Cemetery approach"},{"a":"flagstones-b","u":487.22,"v":496.99,"s":1.237,"f":1,"r":348,"zone":"Cemetery approach"},{"a":"flagstones-b","u":487.57,"v":497.14,"s":1.197,"r":181,"zone":"Cemetery approach"},{"a":"flagstones-c","u":487.93,"v":497.09,"s":1.14,"f":1,"r":49,"zone":"Cemetery approach"},{"a":"flagstones-c","u":488.3,"v":497.14,"s":1.057,"r":222,"zone":"Cemetery approach"},{"a":"flagstones-b","u":488.63,"v":497.11,"s":1.082,"f":1,"r":294,"zone":"Cemetery approach"},{"a":"flagstones-b","u":488.94,"v":497.19,"s":1.143,"f":1,"r":220,"zone":"Cemetery approach"},{"a":"flagstones-a","u":489.26,"v":497.13,"s":1.152,"r":324,"zone":"Cemetery approach"},{"a":"flagstones-d","u":489.57,"v":497.24,"s":1.103,"f":1,"r":180,"zone":"Cemetery approach"},{"a":"flagstones-b","u":489.94,"v":497.25,"s":0.958,"r":190,"zone":"Cemetery approach"},{"a":"flagstones-c","u":490.32,"v":497.24,"s":1.178,"r":184,"zone":"Cemetery approach"},{"a":"flagstones-c","u":490.65,"v":497.19,"s":0.976,"r":178,"zone":"Cemetery approach"},{"a":"flagstones-b","u":490.99,"v":497.3,"s":1.2,"f":1,"r":9,"zone":"Cemetery approach"},{"a":"flagstones-a","u":491.29,"v":497.42,"s":1.022,"f":1,"r":173,"zone":"Cemetery approach"},{"a":"flagstones-c","u":491.6,"v":497.62,"s":1.061,"f":1,"r":241,"zone":"Cemetery approach"},{"a":"flagstones-d","u":491.85,"v":497.84,"s":0.986,"f":1,"r":50,"zone":"Cemetery approach"},{"a":"flagstones-a","u":492.12,"v":498.02,"s":1.122,"r":66,"zone":"Cemetery approach"},{"a":"flagstones-a","u":492.44,"v":498.22,"s":1.194,"f":1,"r":167,"zone":"Cemetery approach"},{"a":"flagstones-c","u":492.7,"v":498.39,"s":1.191,"f":1,"r":240,"zone":"Cemetery approach"},{"a":"flagstones-b","u":493.22,"v":498.75,"s":1.126,"f":1,"r":233,"zone":"Cemetery approach"},{"a":"flagstones-d","u":493.5,"v":498.94,"s":1.142,"f":1,"r":126,"zone":"Cemetery approach"},{"a":"flagstones-d","u":493.79,"v":499.17,"s":0.994,"r":279,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.18,"v":499.2,"s":0.997,"r":175,"zone":"Cemetery approach"},{"a":"flagstones-d","u":494.53,"v":499.32,"s":1.227,"f":1,"r":287,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.72,"v":499.8,"s":1.164,"f":1,"r":90,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.65,"v":500.18,"s":1,"r":296,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.5,"v":500.86,"s":1.198,"r":231,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.59,"v":501.22,"s":1.069,"r":145,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.5,"v":501.55,"s":1.069,"f":1,"r":256,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.49,"v":501.89,"s":1.191,"f":1,"r":133,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.54,"v":502.26,"s":1.239,"f":1,"r":259,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.35,"v":502.59,"s":1.13,"f":1,"r":350,"zone":"Cemetery approach"},{"a":"flagstones-d","u":494.34,"v":502.9,"s":1.243,"f":1,"r":77,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.3,"v":503.26,"s":1.15,"f":1,"r":110,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.41,"v":503.64,"s":1.247,"r":203,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.51,"v":504.01,"s":0.995,"r":258,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.48,"v":504.33,"s":1.098,"r":219,"zone":"Cemetery approach"},{"a":"flagstones-d","u":494.6,"v":504.66,"s":1.183,"r":163,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.56,"v":504.99,"s":1.048,"f":1,"r":64,"zone":"Cemetery approach"},{"a":"flagstones-a","u":494.58,"v":505.36,"s":1.192,"f":1,"r":200,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.64,"v":505.67,"s":1.06,"r":340,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.59,"v":505.99,"s":1.152,"f":1,"r":34,"zone":"Cemetery approach"},{"a":"flagstones-c","u":494.63,"v":506.35,"s":0.957,"f":1,"r":210,"zone":"Cemetery approach"},{"a":"flagstones-b","u":494.6,"v":506.7,"s":1.164,"f":1,"r":19,"zone":"Cemetery approach"},{"a":"grass-tussock","u":485.29,"v":494.53,"s":1.066,"f":1,"zone":"Cemetery approach"},{"a":"grass-tussock","u":485.48,"v":496.71,"s":0.823,"f":1,"zone":"Cemetery approach"},{"a":"grass-tussock","u":486.37,"v":497.22,"s":1.097,"zone":"Cemetery approach"},{"a":"rock-scatter","u":487.1,"v":497.54,"s":0.675,"f":1,"zone":"Cemetery approach"},{"a":"grass-tussock","u":488.35,"v":496.26,"s":0.883,"f":1,"zone":"Cemetery approach"},{"a":"rock-scatter","u":489.33,"v":496.47,"s":0.714,"f":1,"zone":"Cemetery approach"},{"a":"stone-chips-a","u":489.95,"v":497.92,"s":1.017,"f":1,"r":160,"zone":"Cemetery approach"},{"a":"grass-tussock","u":490.99,"v":496.67,"s":0.81,"f":1,"zone":"Cemetery approach"},{"a":"stone-chips-b","u":492.37,"v":497.4,"s":0.846,"r":55,"zone":"Cemetery approach"},{"a":"stone-chips-a","u":492.7,"v":499.01,"s":1.091,"f":1,"r":100,"zone":"Cemetery approach"},{"a":"grass-tussock","u":494.65,"v":498.5,"s":1.085,"zone":"Cemetery approach"},{"a":"stone-chips-a","u":495.01,"v":500.39,"s":0.979,"f":1,"r":9,"zone":"Cemetery approach"},{"a":"rock-scatter","u":495.3,"v":501.42,"s":0.704,"zone":"Cemetery approach"},{"a":"rock-scatter","u":493.7,"v":502.19,"s":0.889,"f":1,"zone":"Cemetery approach"},{"a":"grass-patch","u":495.22,"v":503.55,"s":0.932,"f":1,"zone":"Cemetery approach"},{"a":"grass-tussock","u":495.25,"v":504.99,"s":1.002,"zone":"Cemetery approach"},{"a":"rock-scatter","u":493.8,"v":506.02,"s":0.858,"f":1,"zone":"Cemetery approach"},{"a":"ground-scuff-b","u":494.27,"v":507.2,"s":0.668,"f":1,"r":12,"zone":"Cemetery avenue"},{"a":"ground-scuff-b","u":494.47,"v":507.92,"s":0.666,"r":21,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.59,"v":508.54,"s":0.632,"f":1,"r":328,"zone":"Cemetery avenue"},{"a":"ground-scuff-b","u":494.61,"v":509.23,"s":0.835,"r":334,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.6,"v":509.88,"s":0.719,"f":1,"r":207,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.62,"v":510.52,"s":0.684,"r":133,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.59,"v":511.15,"s":0.815,"f":1,"r":22,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.35,"v":511.92,"s":0.734,"r":117,"zone":"Cemetery avenue"},{"a":"ground-scuff-b","u":494.27,"v":512.59,"s":0.807,"f":1,"r":279,"zone":"Cemetery avenue"},{"a":"ground-scuff-b","u":494.4,"v":513.39,"s":0.702,"f":1,"r":335,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.41,"v":514.16,"s":0.812,"f":1,"r":153,"zone":"Cemetery avenue"},{"a":"ground-scuff-a","u":494.64,"v":514.97,"s":0.658,"r":0,"zone":"Cemetery avenue"},{"a":"flagstones-b","u":494.32,"v":507,"s":1.102,"f":1,"r":1,"zone":"Cemetery avenue"},{"a":"flagstones-b","u":494.36,"v":507.34,"s":0.977,"f":1,"r":274,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.34,"v":507.72,"s":1.108,"f":1,"r":29,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.4,"v":508.06,"s":1.008,"r":115,"zone":"Cemetery avenue"},{"a":"flagstones-d","u":494.55,"v":508.39,"s":1.135,"r":184,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.66,"v":508.75,"s":0.98,"f":1,"r":100,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.67,"v":509.07,"s":1,"f":1,"r":240,"zone":"Cemetery avenue"},{"a":"flagstones-d","u":494.64,"v":509.38,"s":1.018,"r":348,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.55,"v":509.7,"s":1.114,"f":1,"r":332,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.58,"v":510.07,"s":1.148,"r":65,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.56,"v":510.43,"s":1.166,"f":1,"r":7,"zone":"Cemetery avenue"},{"a":"flagstones-b","u":494.6,"v":510.79,"s":0.998,"r":9,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.63,"v":511.15,"s":1.123,"r":278,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.57,"v":511.46,"s":0.984,"f":1,"r":97,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.36,"v":511.81,"s":1.034,"f":1,"r":88,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.29,"v":512.18,"s":1.039,"r":231,"zone":"Cemetery avenue"},{"a":"flagstones-d","u":494.3,"v":512.49,"s":0.965,"f":1,"r":183,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.44,"v":512.85,"s":1.16,"r":23,"zone":"Cemetery avenue"},{"a":"flagstones-b","u":494.43,"v":513.2,"s":0.953,"f":1,"r":3,"zone":"Cemetery avenue"},{"a":"flagstones-c","u":494.49,"v":513.51,"s":1.121,"f":1,"r":204,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.5,"v":513.88,"s":0.972,"f":1,"r":201,"zone":"Cemetery avenue"},{"a":"flagstones-a","u":494.48,"v":514.21,"s":1.214,"r":9,"zone":"Cemetery avenue"},{"a":"flagstones-d","u":494.47,"v":514.58,"s":1.182,"f":1,"r":201,"zone":"Cemetery avenue"},{"a":"flagstones-d","u":494.6,"v":514.9,"s":1.225,"r":11,"zone":"Cemetery avenue"},{"a":"grass-tussock","u":493.66,"v":507.4,"s":0.823,"zone":"Cemetery avenue"},{"a":"stone-chips-b","u":495.18,"v":508.23,"s":1.013,"f":1,"r":284,"zone":"Cemetery avenue"},{"a":"rock-scatter","u":495.17,"v":509.48,"s":0.704,"f":1,"zone":"Cemetery avenue"},{"a":"stone-chips-a","u":493.9,"v":510.52,"s":1.094,"f":1,"r":123,"zone":"Cemetery avenue"},{"a":"grass-tussock","u":493.65,"v":511.89,"s":1.092,"zone":"Cemetery avenue"},{"a":"stone-chips-a","u":493.94,"v":513.07,"s":1.099,"f":1,"r":280,"zone":"Cemetery avenue"},{"a":"stone-chips-b","u":493.89,"v":514.51,"s":0.851,"f":1,"r":173,"zone":"Cemetery avenue"},{"a":"ground-scuff-b","u":487.2,"v":507.01,"s":0.817,"r":80,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":488.02,"v":506.98,"s":0.818,"r":88,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":488.73,"v":507.13,"s":0.83,"f":1,"r":59,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":489.36,"v":507.2,"s":0.843,"r":264,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":490.08,"v":507.16,"s":0.653,"r":169,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":490.71,"v":506.99,"s":0.839,"r":94,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":491.53,"v":506.88,"s":0.645,"r":205,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":492.18,"v":506.92,"s":0.846,"r":209,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":492.98,"v":506.89,"s":0.733,"r":88,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":493.71,"v":506.96,"s":0.692,"f":1,"r":302,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":494.44,"v":507.16,"s":0.617,"r":65,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":495.07,"v":507.14,"s":0.849,"f":1,"r":293,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":495.74,"v":507.01,"s":0.735,"r":350,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":496.43,"v":507.1,"s":0.625,"r":139,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":497.05,"v":506.87,"s":0.771,"f":1,"r":179,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":497.77,"v":506.8,"s":0.774,"f":1,"r":185,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":498.61,"v":506.87,"s":0.714,"f":1,"r":23,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-b","u":499.29,"v":507,"s":0.618,"f":1,"r":265,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":500.11,"v":507.07,"s":0.7,"f":1,"r":300,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":500.73,"v":507.12,"s":0.743,"f":1,"r":332,"zone":"Cemetery crosswalk"},{"a":"ground-scuff-a","u":501.35,"v":507.11,"s":0.793,"r":122,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":487,"v":506.87,"s":1.097,"f":1,"r":307,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":487.36,"v":507,"s":1.199,"f":1,"r":203,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":487.71,"v":506.9,"s":1.184,"f":1,"r":119,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":488.05,"v":507.03,"s":1.194,"r":343,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":488.43,"v":507.06,"s":1.129,"f":1,"r":321,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":488.74,"v":507.08,"s":1,"r":83,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":489.04,"v":507.17,"s":0.961,"r":286,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":489.73,"v":507.14,"s":1.014,"r":40,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":490.1,"v":507.08,"s":0.957,"f":1,"r":119,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":490.44,"v":507.06,"s":1.163,"f":1,"r":294,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":490.76,"v":506.93,"s":1.113,"r":150,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":491.07,"v":506.9,"s":0.991,"f":1,"r":253,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":491.44,"v":506.97,"s":1.1,"f":1,"r":281,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":491.76,"v":506.94,"s":1.121,"f":1,"r":232,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":492.12,"v":506.94,"s":1.247,"r":3,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":492.81,"v":506.79,"s":1.102,"r":304,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":493.14,"v":506.89,"s":0.995,"f":1,"r":311,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":493.5,"v":506.95,"s":1.237,"r":23,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":493.85,"v":507.07,"s":1.105,"f":1,"r":263,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":494.15,"v":507.07,"s":1.186,"f":1,"r":160,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":494.5,"v":507.15,"s":1.234,"f":1,"r":237,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":494.81,"v":507.14,"s":1.175,"f":1,"r":288,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":495.11,"v":507.07,"s":1.219,"f":1,"r":14,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":495.42,"v":507.12,"s":1.098,"r":352,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":495.73,"v":507.01,"s":0.957,"r":272,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":496.43,"v":507.08,"s":1.195,"f":1,"r":59,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":496.79,"v":506.97,"s":0.955,"f":1,"r":229,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":497.1,"v":506.93,"s":1.099,"r":299,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":497.41,"v":506.9,"s":1.045,"r":95,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":497.73,"v":506.81,"s":0.982,"f":1,"r":241,"zone":"Cemetery crosswalk"},{"a":"flagstones-c","u":498.09,"v":506.79,"s":1.04,"f":1,"r":261,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":498.41,"v":506.92,"s":1.028,"f":1,"r":249,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":498.72,"v":506.94,"s":1.037,"r":69,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":499.05,"v":507.06,"s":1.203,"f":1,"r":49,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":499.41,"v":507.04,"s":1.114,"f":1,"r":138,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":499.78,"v":507.04,"s":1.127,"f":1,"r":11,"zone":"Cemetery crosswalk"},{"a":"flagstones-d","u":500.49,"v":507.13,"s":1.104,"r":163,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":500.81,"v":507.12,"s":1.1,"r":158,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":501.17,"v":507.12,"s":0.982,"f":1,"r":337,"zone":"Cemetery crosswalk"},{"a":"flagstones-b","u":501.48,"v":507.09,"s":0.994,"r":269,"zone":"Cemetery crosswalk"},{"a":"flagstones-a","u":501.81,"v":507.13,"s":1.201,"f":1,"r":124,"zone":"Cemetery crosswalk"},{"a":"stone-chips-a","u":487.4,"v":507.52,"s":1.028,"f":1,"r":304,"zone":"Cemetery crosswalk"},{"a":"grass-tussock","u":488.49,"v":506.22,"s":0.866,"zone":"Cemetery crosswalk"},{"a":"stone-chips-b","u":489.35,"v":507.59,"s":1.025,"f":1,"r":103,"zone":"Cemetery crosswalk"},{"a":"grass-tussock","u":490.64,"v":506.28,"s":0.887,"zone":"Cemetery crosswalk"},{"a":"stone-chips-b","u":491.87,"v":506.33,"s":1.122,"r":195,"zone":"Cemetery crosswalk"},{"a":"grass-patch","u":492.89,"v":506.31,"s":0.664,"zone":"Cemetery crosswalk"},{"a":"grass-patch","u":493.86,"v":506.28,"s":0.665,"f":1,"zone":"Cemetery crosswalk"},{"a":"stone-chips-a","u":495.04,"v":506.29,"s":0.805,"r":211,"zone":"Cemetery crosswalk"},{"a":"grass-tussock","u":496.18,"v":507.82,"s":0.885,"f":1,"zone":"Cemetery crosswalk"},{"a":"grass-patch","u":497.15,"v":507.77,"s":0.743,"f":1,"zone":"Cemetery crosswalk"},{"a":"grass-patch","u":498.47,"v":506.37,"s":0.822,"zone":"Cemetery crosswalk"},{"a":"rock-scatter","u":499.8,"v":507.69,"s":0.729,"zone":"Cemetery crosswalk"},{"a":"rock-scatter","u":501.19,"v":507.65,"s":0.793,"zone":"Cemetery crosswalk"},{"a":"grave-cross","u":488.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":490.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":490.9,"v":501.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":492.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-cross","u":496.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":498.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":498.9,"v":501.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":500.5,"v":501.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":501.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":488.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":488.9,"v":503.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":490.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":492.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":492.9,"v":503.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-headstone","u":496.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":496.9,"v":503.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":498.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":500.5,"v":503.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":503.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":500.9,"v":503.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":488.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":490.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":490.9,"v":505.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":492.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-cross","u":496.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":498.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":498.9,"v":505.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":500.5,"v":505.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":505.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-cross","u":488.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":490.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":490.9,"v":509.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":492.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-cross","u":496.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":498.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":498.9,"v":509.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":500.5,"v":509.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":509.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":488.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":488.9,"v":511.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":490.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":492.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":492.9,"v":511.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-headstone","u":496.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":496.9,"v":511.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":498.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":500.5,"v":511.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":511.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":500.9,"v":511.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":488.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":488.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":490.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":490.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":490.9,"v":513.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":492.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":492.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-cross","u":496.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":496.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-headstone","u":498.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":498.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grass-tussock","u":498.9,"v":513.75,"s":0.55,"zone":"Southern cemetery"},{"a":"grave-cross","u":500.5,"v":513.5,"zone":"Southern cemetery"},{"a":"ground-scuff-b","u":500.5,"v":513.85,"s":0.42,"zone":"Southern cemetery"},{"a":"grave-sarcophagus","u":489.5,"v":516,"zone":"Southern cemetery"},{"a":"grave-sarcophagus","u":491.5,"v":516,"zone":"Southern cemetery"},{"a":"grave-sarcophagus","u":497.5,"v":516,"zone":"Southern cemetery"},{"a":"grave-sarcophagus","u":499.5,"v":516,"zone":"Southern cemetery"},{"a":"grave-memorial","u":494.5,"v":516.5,"zone":"Southern cemetery"},{"a":"paving","u":494.5,"v":516.5,"s":0.7,"zone":"Southern cemetery"},{"a":"pillar-broken","u":492.5,"v":500.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":496.5,"v":500.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":486.5,"v":499.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":502.5,"v":499.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":486.5,"v":508.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":502.5,"v":508.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":486.5,"v":516.5,"s":1.15,"zone":"Southern cemetery"},{"a":"pillar-broken","u":502.5,"v":516.5,"s":1.15,"zone":"Southern cemetery"},{"a":"dead-snag","u":486.5,"v":502.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":487,"v":502.8,"s":0.8,"zone":"Southern cemetery"},{"a":"dead-snag","u":486.5,"v":511.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":487,"v":511.8,"s":0.8,"zone":"Southern cemetery"},{"a":"dead-snag","u":502.5,"v":502.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":503,"v":502.8,"s":0.8,"zone":"Southern cemetery"},{"a":"dead-snag","u":502.5,"v":511.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":503,"v":511.8,"s":0.8,"zone":"Southern cemetery"},{"a":"dead-snag","u":488.5,"v":517.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":489,"v":517.8,"s":0.8,"zone":"Southern cemetery"},{"a":"dead-snag","u":500.5,"v":517.5,"s":0.9,"zone":"Southern cemetery"},{"a":"drift-mound","u":501,"v":517.8,"s":0.8,"zone":"Southern cemetery"},{"a":"pine-sapling","u":453.18,"v":470.59,"s":0.995,"zone":"North-west grove"},{"a":"shrub-juniper","u":445.62,"v":465.73,"s":0.915,"f":1,"zone":"North-west grove"},{"a":"pine-broad","u":447.24,"v":463.15,"s":0.822,"f":1,"zone":"North-west grove"},{"a":"pine-sapling","u":451.4,"v":469.3,"s":1.099,"zone":"North-west grove"},{"a":"pine-broad","u":450.44,"v":471.44,"s":0.854,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":452.3,"v":460.73,"s":0.991,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":448.34,"v":460.04,"s":0.87,"f":1,"zone":"North-west grove"},{"a":"grass-tussock","u":450.8,"v":462.76,"s":0.856,"f":1,"zone":"North-west grove"},{"a":"pine-sapling","u":452.58,"v":472.18,"s":1.3,"zone":"North-west grove"},{"a":"grass-tussock","u":446.11,"v":465.28,"s":0.986,"zone":"North-west grove"},{"a":"shrub-juniper","u":446.55,"v":471.94,"s":0.995,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":452.74,"v":468.92,"s":0.886,"f":1,"zone":"North-west grove"},{"a":"shrub-juniper","u":447.07,"v":466.5,"s":1.079,"zone":"North-west grove"},{"a":"pine-tall","u":451.97,"v":465.85,"s":1.051,"f":1,"zone":"North-west grove"},{"a":"pine-sapling","u":446.45,"v":469.37,"s":0.959,"f":1,"zone":"North-west grove"},{"a":"shrub-juniper","u":448.54,"v":464.34,"s":0.938,"f":1,"zone":"North-west grove"},{"a":"shrub-juniper","u":453.04,"v":465.59,"s":1.092,"f":1,"zone":"North-west grove"},{"a":"grass-tussock","u":451.51,"v":472.84,"s":1.092,"f":1,"zone":"North-west grove"},{"a":"shrub-juniper","u":446.02,"v":460.79,"s":0.852,"zone":"North-west grove"},{"a":"pine-broad","u":450.62,"v":460.37,"s":0.912,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":451.74,"v":467.37,"s":1.057,"zone":"North-west grove"},{"a":"pine-sapling","u":451.34,"v":459.47,"s":1.137,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":452.35,"v":463.9,"s":1.001,"zone":"North-west grove"},{"a":"pine-sapling","u":447.89,"v":471.46,"s":1.185,"f":1,"zone":"North-west grove"},{"a":"rock-boulders","u":454.16,"v":472.95,"s":1.049,"f":1,"zone":"North-west grove"},{"a":"grass-tussock","u":452.69,"v":462.86,"s":0.936,"zone":"North-west grove"},{"a":"pine-tall","u":454.1,"v":471.39,"s":1.048,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":447.94,"v":469.14,"s":1.033,"zone":"North-west grove"},{"a":"pine-tall","u":453.69,"v":461.94,"s":0.918,"zone":"North-west grove"},{"a":"pine-tall","u":446.4,"v":463.95,"s":0.95,"f":1,"zone":"North-west grove"},{"a":"pine-tall","u":459.51,"v":448.19,"s":1.022,"zone":"North-east grove"},{"a":"pine-sapling","u":472.02,"v":446.45,"s":1.084,"zone":"North-east grove"},{"a":"pine-sapling","u":470.98,"v":451.31,"s":1.206,"f":1,"zone":"North-east grove"},{"a":"shrub-juniper","u":472.12,"v":447.4,"s":1.127,"zone":"North-east grove"},{"a":"pine-tall","u":466.89,"v":453.77,"s":0.927,"zone":"North-east grove"},{"a":"pine-tall","u":469.15,"v":448.01,"s":1.044,"f":1,"zone":"North-east grove"},{"a":"rock-boulders","u":463.31,"v":449.38,"s":1.068,"zone":"North-east grove"},{"a":"pine-tall","u":464.85,"v":448.2,"s":1.096,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":460.08,"v":452.42,"s":0.997,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":474.4,"v":448.87,"s":0.87,"f":1,"zone":"North-east grove"},{"a":"grass-tussock","u":474.05,"v":447.9,"s":0.872,"f":1,"zone":"North-east grove"},{"a":"pine-broad","u":458.56,"v":453.54,"s":0.916,"f":1,"zone":"North-east grove"},{"a":"pine-sapling","u":463.65,"v":445.5,"s":0.975,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":465.39,"v":445.94,"s":0.986,"zone":"North-east grove"},{"a":"rock-boulders","u":468.76,"v":446.57,"s":0.984,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":473.03,"v":453.78,"s":0.88,"zone":"North-east grove"},{"a":"pine-tall","u":474.79,"v":446.44,"s":0.975,"zone":"North-east grove"},{"a":"pine-broad","u":461.12,"v":447.54,"s":0.853,"zone":"North-east grove"},{"a":"pine-tall","u":464.68,"v":450.5,"s":1.058,"zone":"North-east grove"},{"a":"shrub-juniper","u":465.18,"v":452.39,"s":1.033,"zone":"North-east grove"},{"a":"pine-broad","u":463.36,"v":447.89,"s":0.902,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":463.65,"v":452.01,"s":0.887,"zone":"North-east grove"},{"a":"shrub-juniper","u":462.3,"v":446.75,"s":1.007,"f":1,"zone":"North-east grove"},{"a":"pine-broad","u":474.96,"v":453.24,"s":0.855,"zone":"North-east grove"},{"a":"shrub-juniper","u":474.76,"v":450.08,"s":1.11,"f":1,"zone":"North-east grove"},{"a":"rock-boulders","u":472.08,"v":451.5,"s":0.868,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":473.57,"v":445.53,"s":0.986,"zone":"North-east grove"},{"a":"shrub-juniper","u":463.85,"v":446.65,"s":1.08,"zone":"North-east grove"},{"a":"shrub-juniper","u":471.68,"v":452.92,"s":1.102,"f":1,"zone":"North-east grove"},{"a":"pine-tall","u":459.54,"v":446.79,"s":1.041,"zone":"North-east grove"},{"a":"pine-tall","u":490.87,"v":465.1,"s":0.906,"zone":"East woods"},{"a":"shrub-twigs","u":492.16,"v":469.08,"s":1.09,"zone":"East woods"},{"a":"rock-boulders","u":495.14,"v":461.19,"s":0.967,"f":1,"zone":"East woods"},{"a":"rock-boulders","u":497.86,"v":461.62,"s":1.034,"f":1,"zone":"East woods"},{"a":"pine-sapling","u":494.94,"v":465.37,"s":0.938,"zone":"East woods"},{"a":"pine-tall","u":497.63,"v":468.03,"s":0.96,"f":1,"zone":"East woods"},{"a":"pine-broad","u":498.53,"v":464.71,"s":1.034,"zone":"East woods"},{"a":"rock-boulders","u":491.59,"v":470.68,"s":1.021,"zone":"East woods"},{"a":"shrub-twigs","u":492.94,"v":470.79,"s":1.081,"f":1,"zone":"East woods"},{"a":"pine-sapling","u":497.34,"v":472.16,"s":1.105,"f":1,"zone":"East woods"},{"a":"pine-broad","u":492.35,"v":467.45,"s":0.915,"f":1,"zone":"East woods"},{"a":"pine-broad","u":494.06,"v":470.93,"s":0.801,"f":1,"zone":"East woods"},{"a":"dead-snag","u":498.29,"v":462.86,"s":0.996,"f":1,"zone":"East woods"},{"a":"pine-tall","u":498.86,"v":461.08,"s":1.036,"f":1,"zone":"East woods"},{"a":"dead-snag","u":490.59,"v":466.59,"s":0.905,"zone":"East woods"},{"a":"pine-tall","u":494.05,"v":469.44,"s":1.007,"f":1,"zone":"East woods"},{"a":"pine-tall","u":455.87,"v":491.55,"s":0.889,"zone":"Shrine woods"},{"a":"pine-tall","u":452.81,"v":498.37,"s":1.066,"zone":"Shrine woods"},{"a":"pine-sapling","u":457.54,"v":482.78,"s":1.16,"zone":"Shrine woods"},{"a":"shrub-juniper","u":452.58,"v":495.64,"s":1.135,"f":1,"zone":"Shrine woods"},{"a":"pine-tall","u":458.44,"v":496.66,"s":1.059,"f":1,"zone":"Shrine woods"},{"a":"pine-sapling","u":458.73,"v":486.59,"s":1.127,"zone":"Shrine woods"},{"a":"pine-sapling","u":453.91,"v":490.61,"s":1,"zone":"Shrine woods"},{"a":"pine-sapling","u":457.18,"v":492.52,"s":0.978,"zone":"Shrine woods"},{"a":"pine-tall","u":455.88,"v":488.86,"s":0.952,"zone":"Shrine woods"},{"a":"pine-tall","u":454.85,"v":495.16,"s":0.881,"f":1,"zone":"Shrine woods"},{"a":"pine-sapling","u":458.86,"v":485.38,"s":0.913,"zone":"Shrine woods"},{"a":"pine-sapling","u":454.76,"v":488.09,"s":0.938,"f":1,"zone":"Shrine woods"},{"a":"dead-snag","u":454.93,"v":489.51,"s":0.952,"f":1,"zone":"Shrine woods"},{"a":"pine-sapling","u":459.59,"v":495.75,"s":1.155,"f":1,"zone":"Shrine woods"},{"a":"pine-tall","u":453.35,"v":496.83,"s":0.876,"zone":"Shrine woods"},{"a":"pine-sapling","u":458.04,"v":487.79,"s":1.049,"zone":"Shrine woods"},{"a":"rock-scatter","u":490.8,"v":488.16,"s":0.973,"zone":"Frozen steppe"},{"a":"dead-snag","u":496.99,"v":488.47,"s":1.027,"zone":"Frozen steppe"},{"a":"grass-tussock","u":487.75,"v":496.07,"s":0.991,"zone":"Frozen steppe"},{"a":"grass-patch","u":489.45,"v":484.24,"s":1.022,"zone":"Frozen steppe"},{"a":"shrub-twigs","u":494.59,"v":487.3,"s":1.074,"f":1,"zone":"Frozen steppe"},{"a":"rock-boulders","u":487.87,"v":484.81,"s":0.934,"f":1,"zone":"Frozen steppe"},{"a":"dead-tree","u":495.97,"v":484.51,"s":0.934,"f":1,"zone":"Frozen steppe"},{"a":"grass-tussock","u":497.03,"v":483.54,"s":0.916,"zone":"Frozen steppe"},{"a":"grass-tussock","u":494.2,"v":486.55,"s":1.139,"f":1,"zone":"Frozen steppe"},{"a":"grass-patch","u":496.23,"v":498.01,"s":0.958,"zone":"Frozen steppe"},{"a":"dead-tree","u":497.5,"v":484.74,"s":1.006,"f":1,"zone":"Frozen steppe"},{"a":"grass-tussock","u":493.39,"v":496.66,"s":0.954,"zone":"Frozen steppe"},{"a":"dead-snag","u":490.46,"v":491.87,"s":0.906,"f":1,"zone":"Frozen steppe"},{"a":"rock-boulders","u":486.15,"v":482.82,"s":1.144,"f":1,"zone":"Frozen steppe"},{"a":"dead-snag","u":491.28,"v":493.56,"s":1.078,"zone":"Frozen steppe"},{"a":"dead-tree","u":485.61,"v":488.49,"s":0.884,"f":1,"zone":"Frozen steppe"},{"a":"shrub-twigs","u":489.63,"v":498.5,"s":1.13,"f":1,"zone":"Frozen steppe"},{"a":"shrub-twigs","u":492.86,"v":489.2,"s":1.138,"f":1,"zone":"Frozen steppe"},{"a":"shrub-twigs","u":473.36,"v":496.2,"s":1.002,"f":1,"zone":"Southern snowfield"},{"a":"shrub-twigs","u":470.14,"v":493.43,"s":0.892,"f":1,"zone":"Southern snowfield"},{"a":"grass-patch","u":470.87,"v":493.25,"s":0.859,"f":1,"zone":"Southern snowfield"},{"a":"dead-snag","u":475.7,"v":486.25,"s":0.955,"zone":"Southern snowfield"},{"a":"grass-patch","u":470.69,"v":489.41,"s":0.931,"zone":"Southern snowfield"},{"a":"grass-tussock","u":473.04,"v":487.92,"s":0.856,"f":1,"zone":"Southern snowfield"},{"a":"grass-tussock","u":471.39,"v":498.48,"s":0.898,"f":1,"zone":"Southern snowfield"},{"a":"shrub-twigs","u":467.38,"v":488.45,"s":0.962,"f":1,"zone":"Southern snowfield"},{"a":"grass-tussock","u":467.91,"v":493,"s":0.985,"zone":"Southern snowfield"},{"a":"rock-scatter","u":474.56,"v":484.02,"s":0.879,"zone":"Southern snowfield"},{"a":"rock-scatter","u":468.32,"v":493.78,"s":0.932,"f":1,"zone":"Southern snowfield"},{"a":"grass-patch","u":470.12,"v":495.14,"s":1.054,"f":1,"zone":"Southern snowfield"},{"a":"grass-tussock","u":469.54,"v":491.5,"s":1.002,"f":1,"zone":"Southern snowfield"},{"a":"grass-patch","u":469.7,"v":497.58,"s":0.89,"f":1,"zone":"Southern snowfield"},{"a":"grass-tussock","u":471.36,"v":497.44,"s":0.882,"zone":"Southern snowfield"},{"a":"grass-tussock","u":473.89,"v":486.66,"s":0.983,"zone":"Southern snowfield"},{"a":"grass-patch","u":488.33,"v":483,"s":1.078,"zone":"Gate meadow"},{"a":"grass-tussock","u":477.2,"v":477.99,"s":1.089,"zone":"Gate meadow"},{"a":"rock-scatter","u":480.76,"v":476.52,"s":1.146,"zone":"Gate meadow"},{"a":"rock-scatter","u":484.33,"v":476.45,"s":1.118,"f":1,"zone":"Gate meadow"},{"a":"rock-scatter","u":478.32,"v":487.52,"s":1.094,"f":1,"zone":"Gate meadow"},{"a":"grass-patch","u":477.41,"v":481.04,"s":1.081,"f":1,"zone":"Gate meadow"},{"a":"rock-scatter","u":479.43,"v":483.29,"s":1.128,"zone":"Gate meadow"},{"a":"grass-tussock","u":483.95,"v":480.29,"s":0.904,"f":1,"zone":"Gate meadow"},{"a":"grass-tussock","u":482.87,"v":481.05,"s":1.118,"zone":"Gate meadow"},{"a":"rock-scatter","u":477.66,"v":488.06,"s":0.993,"f":1,"zone":"Gate meadow"},{"a":"grass-tussock","u":477.51,"v":486.74,"s":0.942,"zone":"Gate meadow"},{"a":"grass-patch","u":480.89,"v":477.14,"s":1.096,"zone":"Gate meadow"}];

export function rectColumns(
  u: number,
  v: number,
  r: FrontierRect,
  origin = STRONGHOLD_ORIGIN,
): FootprintColumn[] {
  const [ru0, rv0, ru1, rv1] = r;
  const corners = [
    mapToCourt(u + ru0, v + rv0, origin),
    mapToCourt(u + ru1, v + rv0, origin),
    mapToCourt(u + ru1, v + rv1, origin),
    mapToCourt(u + ru0, v + rv1, origin),
  ];
  const xMin = Math.min(...corners.map((c) => c.x));
  const xMax = Math.max(...corners.map((c) => c.x));
  const yMin = Math.min(...corners.map((c) => c.y));
  const yMax = Math.max(...corners.map((c) => c.y));
  const cols: FootprintColumn[] = [];
  for (let x = Math.round(xMin); x <= Math.round(xMax); x += 4) {
    const ys: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      if ((a.x <= x && x <= b.x) || (b.x <= x && x <= a.x)) {
        const dx = b.x - a.x;
        if (Math.abs(dx) < 0.001) {
          ys.push(a.y, b.y);
        } else {
          ys.push(a.y + ((x - a.x) / dx) * (b.y - a.y));
        }
      }
    }
    if (ys.length < 2) continue;
    const y0 = Math.max(yMin, Math.min(...ys));
    const y1 = Math.min(yMax, Math.max(...ys));
    cols.push([x, Math.round(y0), Math.round(y1)]);
  }
  return cols;
}

export function scaleAndFlipFootprint(
  rects: readonly FrontierRect[],
  scale = 1,
  flip = false,
): FrontierRect[] {
  return rects.map(([u0, v0, u1, v1]) =>
    flip
      ? [v0 * scale, u0 * scale, v1 * scale, u1 * scale]
      : [u0 * scale, v0 * scale, u1 * scale, v1 * scale],
  );
}

export function footprintColumns(
  prop: Pick<FrontierProp, "u" | "v" | "footprint">,
  origin = STRONGHOLD_ORIGIN,
): FootprintColumn[] {
  const cols: FootprintColumn[] = [];
  for (const r of prop.footprint) {
    cols.push(...rectColumns(prop.u, prop.v, r, origin));
  }
  return cols;
}

export function groundProfileFn(
  xCenter: number,
  yPivot: number,
  w: number,
  h: number,
  ax: number,
  ay: number,
  ground: readonly number[],
  flip = false,
): (x: number) => number | null {
  const left = xCenter - w * (flip ? 1 - ax : ax);
  const top = yPivot - h * ay;
  return (x: number) => {
    const t = (x - left) / w;
    if (t < 0 || t > 1 || ground.length === 0) return null;
    const u = flip ? 1 - t : t;
    const idx = u * (ground.length - 1);
    const i = Math.min(ground.length - 2, Math.max(0, Math.floor(idx)));
    const frac = idx - i;
    const g = ground[i]! * (1 - frac) + ground[i + 1]! * frac;
    return top + g * h;
  };
}

export function groundPlaneMatrix(
  scaleX: number,
  scaleY: number,
  rotateDeg: number,
  tx: number,
  ty: number,
): Matrix {
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return new Matrix(
    cos * scaleX,
    0.5 * sin * scaleY,
    -2 * sin * scaleX,
    cos * scaleY,
    tx,
    ty,
  );
}

function keyOfTile(u: number, v: number): string {
  return `${u.toFixed(2)},${v.toFixed(2)}`;
}

export function buildFrontierProps(options?: {
  placements?: readonly FrontierPlacement[];
  kit?: Record<string, FrontierKitItem>;
  sprites?: Record<string, FrontierSpriteMeta>;
  origin?: { u: number; v: number };
}): FrontierProp[] {
  const placements = options?.placements ?? DEFAULT_FRONTIER_PLACEMENTS;
  const kit = options?.kit ?? DEFAULT_FRONTIER_KIT;
  const sprites = options?.sprites ?? FROZEN_FRONTIER_SPRITES;
  const origin = options?.origin ?? STRONGHOLD_ORIGIN;

  const wallByTile = new Map<string, FrontierProp>();
  const rawProps: Array<{
    prop: FrontierProp;
    on?: { u: number; v: number };
  }> = [];

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const meta = sprites[p.a];
    const kitItem = kit[p.a];
    if (!meta || !kitItem) continue;

    const scale = p.s ?? 1;
    const flip = Boolean(p.f);
    const pos = mapToCourt(p.u, p.v, origin);
    const w = meta.world[0] * scale;
    const h = meta.world[1] * scale;
    const [ax, ay] = meta.pivot;
    const lift = p.lift ?? 0;
    const isCap = Boolean(p.on) || kitItem.layer === "cap";
    const layer: FrontierLayerKind = isCap ? "cap" : kitItem.layer;
    const band =
      kitItem.band === "under" ? -1 : kitItem.band === "over" ? 1 : 0;
    const footprint = scaleAndFlipFootprint(kitItem.block, scale, flip);
    const front =
      layer === "upright"
        ? groundProfileFn(pos.x, pos.y, w, h, ax, ay, meta.ground, flip)
        : undefined;

    const prop: FrontierProp = {
      id: `frontier-${i}-${p.a}`,
      asset: p.a,
      x: pos.x,
      y: pos.y,
      u: p.u,
      v: p.v,
      w,
      h,
      ax,
      ay,
      scale,
      flip,
      rotate: p.r,
      shear: meta.shear ?? 0,
      lift,
      zBoost: 0,
      front,
      layer,
      band,
      solid: footprint.length > 0 && !isCap,
      footprint,
      zone: p.zone,
    };

    if (layer === "upright" && !p.on) {
      wallByTile.set(keyOfTile(p.u, p.v), prop);
    }
    rawProps.push({ prop, on: p.on });
  }

  for (const item of rawProps) {
    if (!item.on) continue;
    const parent = wallByTile.get(keyOfTile(item.on.u, item.on.v));
    if (parent) {
      item.prop.zBoost = parent.y - item.prop.y + 0.01;
      item.prop.front = parent.front;
      item.prop.footprint = parent.footprint;
      item.prop.solid = false;
    }
  }

  return rawProps.map((r) => r.prop);
}

export function buildFrontierColumns(
  props: readonly FrontierProp[],
  origin = STRONGHOLD_ORIGIN,
): FootprintColumn[] {
  const cols: FootprintColumn[] = [];
  for (const prop of props) {
    if (!prop.solid || prop.footprint.length === 0) continue;
    cols.push(...footprintColumns(prop, origin));
  }
  return cols;
}

export const FRONTIER_PROPS = buildFrontierProps();
export const FRONTIER_COLUMNS = buildFrontierColumns(FRONTIER_PROPS);

function resolveFrontierTexture(
  asset: string,
  meta: FrontierSpriteMeta,
  textures: Record<string, Texture | undefined>,
  atlasTexture?: Texture,
): Texture {
  const direct = textures[asset] ?? textures[`/frozen-frontier/${asset}.png`];
  if (direct) return direct;
  if (
    atlasTexture &&
    atlasTexture.width >= meta.frame[0] + meta.frame[2] &&
    atlasTexture.height >= meta.frame[1] + meta.frame[3]
  ) {
    return new Texture({
      source: atlasTexture.source,
      frame: new Rectangle(
        meta.frame[0],
        meta.frame[1],
        meta.frame[2],
        meta.frame[3],
      ),
    });
  }

  if (asset.includes("pine") || asset.includes("dead-tree") || asset.includes("snag")) {
    return (
      textures["/modular-stronghold/v2/spruce-mature.png"] ??
      textures["/modular-stronghold/v2/fir-young.png"] ??
      Texture.WHITE
    );
  }
  if (asset.includes("shrub") || asset.includes("grass")) {
    return (
      textures["/modular-stronghold/v2/weeds-edge.png"] ??
      textures["/modular-stronghold/v2/fir-young.png"] ??
      Texture.WHITE
    );
  }
  if (asset.includes("drift")) {
    return (
      textures["/modular-stronghold/v2/snowdrift-edge.png"] ??
      textures["/modular-stronghold/v2/snow-soft-texture.png"] ??
      Texture.WHITE
    );
  }
  if (asset.includes("rock") || asset.includes("rubble") || asset.includes("chips")) {
    return (
      textures["/modular-stronghold/v2/boulders-snow.png"] ??
      textures["/modular-stronghold/v2/cliff-snow.png"] ??
      Texture.WHITE
    );
  }
  if (
    asset.includes("paving") ||
    asset.includes("flagstones") ||
    asset.includes("floor") ||
    asset.includes("foundation") ||
    asset.includes("podium") ||
    asset.includes("scuff")
  ) {
    return (
      textures["/modular-stronghold/v2/paving-worn.png"] ??
      textures["/modular-stronghold/v2/paving-warm-texture.png"] ??
      Texture.WHITE
    );
  }
  if (asset.includes("wall-se") || asset.includes("arch-se")) {
    return (
      textures["/buildings/starter-boundary/straight-se-a.png"] ??
      textures["/modular-stronghold/v2/cliff-snow.png"] ??
      Texture.WHITE
    );
  }
  if (asset.includes("gate")) {
    return (
      textures["/buildings/starter-boundary/gate-closed.png"] ??
      textures["/modular-stronghold/v2/cliff-snow.png"] ??
      Texture.WHITE
    );
  }
  return (
    textures["/buildings/starter-boundary/straight-ne-a.png"] ??
    textures["/modular-stronghold/v2/cliff-snow.png"] ??
    Texture.WHITE
  );
}

export type FrontierLayerResult = {
  ground: Container;
  shade: Container;
  upright: Container;
  sprites: Map<string, Sprite>;
  cull: (
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
    pad?: number,
  ) => { visibleCount: number; totalCount: number };
};

const SUN_SHADOW = { dx: 0.72, dy: 0.36, scale: 0.56, alpha: 0.24 };

function buildShadowFilter() {
  try {
    const tint = new ColorMatrixFilter();
    tint.matrix = [
      0, 0, 0, 0, 20 / 255,
      0, 0, 0, 0, 28 / 255,
      0, 0, 0, 0, 44 / 255,
      0, 0, 0, 1, 0,
    ];
    return [tint, new BlurFilter({ strength: 3, quality: 2 })];
  } catch {
    return [];
  }
}

export function createFrontierLayer(
  props: readonly FrontierProp[],
  textures: Record<string, Texture | undefined>,
  options?: {
    atlasTexture?: Texture;
    liftAt?: (x: number, y: number) => number;
  },
): FrontierLayerResult {
  const ground = new Container();
  ground.sortableChildren = true;
  ground.zIndex = 2.6;

  const shade = new Container();
  shade.sortableChildren = true;
  shade.zIndex = 3.25;
  const shadowFilters = buildShadowFilter();
  if (shadowFilters.length > 0) {
    shade.filters = shadowFilters;
  }

  const upright = new Container();
  upright.sortableChildren = true;
  upright.zIndex = 10;

  const atlasTex =
    options?.atlasTexture ??
    textures["/frozen-frontier/game/atlas-5083a8ebd8c8bb4b.webp"];
  const liftAt = options?.liftAt ?? (() => 0);
  const sprites = new Map<string, Sprite>();
  const cullEntries: Array<{
    prop: FrontierProp;
    sprite: Sprite;
    baseY: number;
  }> = [];

  for (let idx = 0; idx < props.length; idx++) {
    const prop = props[idx]!;
    const meta = FROZEN_FRONTIER_SPRITES[prop.asset];
    if (!meta) continue;
    const tex = resolveFrontierTexture(
      prop.asset,
      meta,
      textures,
      atlasTex,
    );
    const sprite = new Sprite(tex);
    const terrainLift = liftAt(prop.x, prop.y);
    const drawY = prop.y - terrainLift - prop.lift;
    const frameW = Math.max(1, tex.width || meta.frame[2]);
    const frameH = Math.max(1, tex.height || meta.frame[3]);
    const scaleX = prop.w / frameW;
    const scaleY = prop.h / frameH;
    const flipSign = prop.flip ? -1 : 1;

    if (prop.layer === "ground") {
      sprite.zIndex = prop.band * 100000 + idx;
      if (prop.rotate) {
        const rad = (prop.rotate * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const a00 = flipSign * scaleX * cos;
        const a01 = -2 * scaleX * sin;
        const a10 = 0.5 * flipSign * scaleY * sin;
        const a11 = scaleY * cos;
        const px = frameW * prop.ax;
        const py = frameH * prop.ay;
        sprite.anchor.set(0, 0);
        sprite.setFromMatrix(
          new Matrix(
            a00,
            a10,
            a01,
            a11,
            prop.x - a00 * px - a01 * py,
            drawY - a10 * px - a11 * py,
          ),
        );
      } else {
        sprite.anchor.set(prop.ax, prop.ay);
        sprite.position.set(prop.x, drawY);
        sprite.scale.set(flipSign * scaleX, scaleY);
      }
      ground.addChild(sprite);
    } else {
      sprite.anchor.set(prop.ax, prop.ay);
      if (prop.shear) {
        sprite.setFromMatrix(
          new Matrix(
            flipSign * scaleX,
            prop.shear * flipSign * scaleX,
            0,
            scaleY,
            prop.x,
            drawY,
          ),
        );
      } else {
        sprite.position.set(prop.x, drawY);
        sprite.scale.set(flipSign * scaleX, scaleY);
      }
      sprite.zIndex = prop.y + prop.zBoost;
      upright.addChild(sprite);

      if (
        prop.layer === "upright" &&
        prop.lift <= 4 &&
        meta.heightM >= 0.9 &&
        atlasTex &&
        atlasTex.width >= meta.frame[0] + meta.frame[2] &&
        atlasTex.height >= meta.frame[1] + meta.frame[3]
      ) {
        const g = meta.ground;
        const n = g.length;
        const strips = Math.min(8, Math.max(1, n - 1));
        const dx = SUN_SHADOW.dx * SUN_SHADOW.scale;
        const dy = SUN_SHADOW.dy * SUN_SHADOW.scale;
        for (let i = 0; i < strips; i++) {
          const t0 = i / strips;
          const t1 = (i + 1) / strips;
          const x0 = Math.floor(t0 * meta.frame[2]);
          const x1 = i === strips - 1 ? meta.frame[2] : Math.floor(t1 * meta.frame[2]);
          const sw = x1 - x0;
          if (sw <= 0) continue;
          const sample = (t: number) => {
            const u = Math.max(0, Math.min(n - 1, t * (n - 1)));
            const k = Math.min(n - 2, Math.floor(u));
            return g[k]! + (g[k + 1]! - g[k]!) * (u - k);
          };
          const g0 = sample(t0);
          const g1 = sample(t1);
          const sub = new Texture({
            source: atlasTex.source,
            frame: new Rectangle(meta.frame[0] + x0, meta.frame[1], sw, meta.frame[3]),
          });
          const sh = new Sprite(sub);
          const slope = ((g1 - g0) * meta.frame[3]) / sw;
          const a = flipSign * scaleX;
          const b = prop.shear * flipSign * scaleX + scaleY * slope * (1 - dy);
          const c = -scaleX * dx;
          const d = scaleY * dy;
          const u0 = x0 - meta.frame[2] * prop.ax;
          const v0 = meta.frame[3] * (g0 - prop.ay);
          sh.anchor.set(0, g0);
          sh.setFromMatrix(
            new Matrix(
              a,
              b,
              c,
              d,
              prop.x + a * u0 + scaleX * dx * v0,
              drawY + prop.shear * a * u0 + scaleY * (1 - dy) * v0,
            ),
          );
          sh.alpha = SUN_SHADOW.alpha;
          sh.zIndex = idx;
          shade.addChild(sh);
        }
      }
    }

    sprites.set(prop.id, sprite);
    cullEntries.push({ prop, sprite, baseY: drawY });
  }

  const cull = (
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
    pad = 512,
  ) => {
    const x0 = viewX - pad;
    const y0 = viewY - pad;
    const x1 = viewX + viewWidth + pad;
    const y1 = viewY + viewHeight + pad;
    let visibleCount = 0;
    for (const entry of cullEntries) {
      const { prop, sprite, baseY } = entry;
      const hw = prop.w * 0.65;
      const hh = prop.h;
      const visible =
        prop.x + hw >= x0 &&
        prop.x - hw <= x1 &&
        baseY + hh * (1 - prop.ay) >= y0 &&
        baseY - hh * prop.ay <= y1;
      sprite.visible = visible;
      if (visible) visibleCount++;
    }
    return { visibleCount, totalCount: cullEntries.length };
  };

  return {
    ground,
    shade,
    upright,
    sprites,
    cull,
  };
}
