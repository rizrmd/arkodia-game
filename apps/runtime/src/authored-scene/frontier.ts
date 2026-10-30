import {
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

export const DEFAULT_FRONTIER_PLACEMENTS: FrontierPlacement[] = [
  { a: "ground-scuff-a", u: 478.11, v: 478.16, s: 0.717, r: 319, zone: "Frontier road" },
  { a: "ground-scuff-a", u: 478.65, v: 478.66, s: 0.735, f: 1, r: 245, zone: "Frontier road" },
  { a: "flagstones-a", u: 476.4, v: 476.5, s: 1, zone: "Frontier road" },
  { a: "flagstones-b", u: 477.2, v: 477.1, s: 1, zone: "Frontier road" },
  { a: "pine-tall", u: 454.2, v: 462.4, s: 1, zone: "Northwest woods" },
  { a: "pine-broad", u: 452.6, v: 466.8, s: 1, zone: "Northwest woods" },
  { a: "pine-tall", u: 482.4, v: 458.5, s: 1.05, zone: "Northeast pines" },
  { a: "pine-sapling", u: 484.1, v: 460.2, s: 1, zone: "Northeast pines" },
  { a: "rock-boulders", u: 456.5, v: 478.2, s: 1, zone: "West clearing" },
  { a: "ruined-gate", u: 478.9, v: 488.4, s: 1, zone: "Southern ruins" },
  { a: "temple-podium", u: 478.9, v: 492.5, s: 1, zone: "Southern ruins" },
  { a: "pillar-intact", u: 478.1, v: 491.1, s: 1, zone: "Southern ruins" },
  { a: "pillar-broken", u: 479.6, v: 493.8, s: 1, zone: "Southern ruins" },
  { a: "snowy-shrine", u: 466.5, v: 485.2, s: 1, zone: "West terrace" },
  { a: "broken-watchtower", u: 486.2, v: 468.2, s: 1, zone: "East ridge" },
  { a: "wall-ne", u: 474.2, v: 486.0, s: 1, zone: "Outer ruins" },
  {
    a: "drift-ne",
    u: 474.2,
    v: 486.0,
    s: 1,
    lift: 42,
    on: { u: 474.2, v: 486.0 },
    zone: "Outer ruins",
  },
  { a: "grave-memorial", u: 460.8, v: 489.4, s: 1, zone: "Old graveyard" },
  { a: "grave-headstone", u: 459.4, v: 490.2, s: 1, zone: "Old graveyard" },
  { a: "grave-cross", u: 462.1, v: 490.6, s: 1, zone: "Old graveyard" },
];

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
    const isCap = Boolean(p.on) || kitItem.layer === "cap" || lift > 0;
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
  shade: Graphics;
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
  ground.zIndex = -10;

  const shade = new Graphics();
  shade.zIndex = 4;

  const upright = new Container();
  upright.sortableChildren = true;
  upright.zIndex = 10;

  const liftAt = options?.liftAt ?? (() => 0);
  const sprites = new Map<string, Sprite>();
  const cullEntries: Array<{
    prop: FrontierProp;
    sprite: Sprite;
    baseY: number;
  }> = [];

  for (const prop of props) {
    const meta = FROZEN_FRONTIER_SPRITES[prop.asset];
    if (!meta) continue;
    const tex = resolveFrontierTexture(
      prop.asset,
      meta,
      textures,
      options?.atlasTexture,
    );
    const sprite = new Sprite(tex);
    const terrainLift = liftAt(prop.x, prop.y);
    const drawY = prop.y - terrainLift - prop.lift;
    const sx = (prop.w / Math.max(1, tex.width)) * (prop.flip ? -1 : 1);
    const sy = prop.h / Math.max(1, tex.height);

    sprite.anchor.set(prop.ax, prop.ay);
    sprite.position.set(prop.x, drawY);
    sprite.scale.set(sx, sy);

    if (prop.layer === "ground") {
      sprite.zIndex = prop.band;
      if (prop.rotate !== undefined) {
        const m = groundPlaneMatrix(sx, sy, prop.rotate, prop.x, drawY);
        sprite.setFromMatrix(m);
      }
      ground.addChild(sprite);
    } else {
      if (prop.shear !== 0) {
        sprite.setFromMatrix(
          new Matrix(sx, prop.shear * sx, 0, sy, prop.x, drawY),
        );
      }
      sprite.zIndex = prop.y + prop.zBoost;
      upright.addChild(sprite);

      if (prop.layer === "upright" && prop.front) {
        const strips = 12;
        const left = prop.x - prop.w * (prop.flip ? 1 - prop.ax : prop.ax);
        const stepW = prop.w / strips;
        for (let s = 0; s < strips; s++) {
          const sx0 = left + (s + 0.5) * stepW;
          const gy = prop.front(sx0);
          if (gy === null) continue;
          shade
            .ellipse(sx0, gy - terrainLift + 2, stepW * 0.65, 5)
            .fill({ color: 0x0b1018, alpha: 0.16 });
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
