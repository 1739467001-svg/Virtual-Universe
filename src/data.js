// 太阳系数据
// 说明：真实尺度下行星相对太阳与轨道太小，肉眼几乎不可见，
// 因此这里采用「可观赏比例」——保留各天体的相对大小与轨道顺序关系，
// 但对半径和轨道距离做了非线性压缩，方便漫游观赏。
// orbitPeriod / rotationPeriod 为相对地球的倍数，用于驱动公转/自转动画。
// axialTilt 为真实自转轴倾角（度），type/seed 用于程序化纹理。

export const SUN = {
  name: "太阳",
  enName: "Sun",
  radius: 8,
  color: 0xffcc33,
  type: "sun",
  desc: "太阳系的中心恒星，占系统总质量的 99.86%。一颗 G2V 型黄矮星，核聚变每秒将约 6 亿吨氢转化为氦。",
  stats: [
    ["类型", "G 型主序星"],
    ["直径", "约 139 万 km"],
    ["表面温度", "约 5500 ℃"],
    ["年龄", "约 46 亿年"],
  ],
};

// distance: 轨道半径（场景单位）
// size: 行星半径（场景单位）
// orbitPeriod: 公转周期（地球年）
// rotationPeriod: 自转周期（地球日，负数表示逆向自转）
// axialTilt: 自转轴倾角（度，真实值）
// tilt: 轨道初始相位（弧度），让行星错开分布
export const PLANETS = [
  {
    name: "水星", enName: "Mercury", color: 0x9a8c7a, type: "rocky", seed: 11,
    distance: 16, size: 0.8, orbitPeriod: 0.24, rotationPeriod: 58.6, axialTilt: 0.03, tilt: 0.3,
    desc: "离太阳最近、体积最小的行星。没有大气保温，昼夜温差极端，从 -170℃ 到 430℃。",
    stats: [["与日距离", "0.39 AU"], ["公转周期", "88 天"], ["自转轴倾角", "0.03°"], ["卫星", "0"]],
  },
  {
    name: "金星", enName: "Venus", color: 0xe8c07a, type: "rocky", seed: 22,
    distance: 23, size: 1.5, orbitPeriod: 0.62, rotationPeriod: -243, axialTilt: 177.4, tilt: 1.1,
    desc: "太阳系最热的行星，浓厚的二氧化碳大气造成失控温室效应，表面约 465℃。自转方向与多数行星相反。",
    stats: [["与日距离", "0.72 AU"], ["公转周期", "225 天"], ["自转轴倾角", "177°（几乎倒转）"], ["卫星", "0"]],
  },
  {
    name: "地球", enName: "Earth", color: 0x3a7bd5, type: "earth", seed: 7,
    distance: 32, size: 1.6, orbitPeriod: 1.0, rotationPeriod: 1.0, axialTilt: 23.4, tilt: 2.4,
    desc: "我们的家园，目前已知唯一存在生命的行星。表面 71% 被液态水覆盖，拥有保护性的磁场与大气层。",
    stats: [["与日距离", "1.00 AU"], ["公转周期", "365 天"], ["自转轴倾角", "23.4°"], ["卫星", "1（月球）"]],
    moons: [{ name: "月球", size: 0.45, distance: 3.2, orbitPeriod: 0.075, color: 0xbbbbbb }],
  },
  {
    name: "火星", enName: "Mars", color: 0xc1440e, type: "rocky", seed: 33,
    distance: 42, size: 1.1, orbitPeriod: 1.88, rotationPeriod: 1.03, axialTilt: 25.2, tilt: 3.6,
    desc: "红色星球，因表面氧化铁（铁锈）而呈红色。拥有太阳系最高的火山奥林帕斯山，是人类探测的热点。",
    stats: [["与日距离", "1.52 AU"], ["公转周期", "687 天"], ["自转轴倾角", "25.2°"], ["卫星", "2"]],
    moons: [
      { name: "火卫一", size: 0.12, distance: 1.9, orbitPeriod: 0.00087, color: 0x9b8b7a },
      { name: "火卫二", size: 0.08, distance: 2.7, orbitPeriod: 0.0035, color: 0x9b8b7a },
    ],
  },
  {
    name: "木星", enName: "Jupiter", color: 0xd8a06a, type: "gasGiant", seed: 3, redSpot: true,
    distance: 62, size: 4.5, orbitPeriod: 11.86, rotationPeriod: 0.41, axialTilt: 3.1, tilt: 0.8,
    desc: "太阳系最大的行星，气态巨行星。著名的大红斑是一个已持续数百年的巨型风暴，比地球还大。",
    stats: [["与日距离", "5.20 AU"], ["公转周期", "11.9 年"], ["自转轴倾角", "3.1°"], ["卫星", "95+"]],
    moons: [
      { name: "木卫一·伊奥", size: 0.25, distance: 6.5, orbitPeriod: 0.0048, color: 0xd8c46a },
      { name: "木卫二·欧罗巴", size: 0.22, distance: 8.2, orbitPeriod: 0.0097, color: 0xcdb89a },
      { name: "木卫三·盖尼米德", size: 0.34, distance: 10.2, orbitPeriod: 0.0196, color: 0x9a8e7d },
      { name: "木卫四·卡里斯托", size: 0.31, distance: 12.6, orbitPeriod: 0.0457, color: 0x7a6f63 },
    ],
  },
  {
    name: "土星", enName: "Saturn", color: 0xe3c98f, type: "gasGiant", seed: 44,
    distance: 84, size: 3.8, orbitPeriod: 29.46, rotationPeriod: 0.45, axialTilt: 26.7, tilt: 5.1,
    desc: "以壮观的行星环著称，环主要由冰粒与岩石碎块组成。密度极低，理论上能浮在水面上。",
    stats: [["与日距离", "9.58 AU"], ["公转周期", "29.5 年"], ["自转轴倾角", "26.7°"], ["卫星", "146+"]],
    ring: { inner: 4.8, outer: 8.0, color: 0xcdbb99 },
    moons: [
      { name: "土卫二·恩克拉多斯", size: 0.10, distance: 8.6, orbitPeriod: 0.0037, color: 0xeef3f7 },
      { name: "土卫五·瑞亚", size: 0.16, distance: 9.6, orbitPeriod: 0.0124, color: 0xbfc2c8 },
      { name: "土卫六·泰坦", size: 0.34, distance: 11.4, orbitPeriod: 0.0436, color: 0xc9a24a },
    ],
  },
  {
    name: "天王星", enName: "Uranus", color: 0x88d0e0, type: "iceGiant", seed: 55,
    distance: 104, size: 2.6, orbitPeriod: 84.0, rotationPeriod: -0.72, axialTilt: 97.8, tilt: 2.0,
    desc: "冰巨星，自转轴几乎横躺在轨道面上（倾角约 98°），仿佛「滚着」绕太阳运行。甲烷让它呈青蓝色。",
    stats: [["与日距离", "19.2 AU"], ["公转周期", "84 年"], ["自转轴倾角", "97.8°（横躺）"], ["卫星", "28"]],
    ring: { inner: 3.2, outer: 4.4, color: 0x99bbcc },
  },
  {
    name: "海王星", enName: "Neptune", color: 0x3b5bdb, type: "iceGiant", seed: 66,
    distance: 120, size: 2.5, orbitPeriod: 164.8, rotationPeriod: 0.67, axialTilt: 28.3, tilt: 4.2,
    desc: "距太阳最远的行星，深蓝色的冰巨星。拥有太阳系中最强的风暴，风速可超过 2000 km/h。",
    stats: [["与日距离", "30.1 AU"], ["公转周期", "164.8 年"], ["自转轴倾角", "28.3°"], ["卫星", "16"]],
  },
];

// 矮行星：与八大行星共用同一套渲染流程（无真实贴图，自动回退程序化纹理）。
// distance 仍按场景「可观赏比例」摆放（谷神星落在小行星带、冥王星在海王星之外）。
export const DWARFS = [
  {
    name: "谷神星", enName: "Ceres", color: 0x9c9388, type: "rocky", seed: 88, dwarf: true,
    distance: 53, size: 0.3, orbitPeriod: 4.6, rotationPeriod: 0.378, axialTilt: 4, tilt: 5.5,
    desc: "小行星带中最大的天体，也是内太阳系唯一的矮行星。表面含水冰，曾由「黎明号」探测器近距离造访。",
    stats: [["与日距离", "2.77 AU"], ["公转周期", "4.6 年"], ["直径", "约 940 km"], ["分类", "矮行星"]],
  },
  {
    name: "冥王星", enName: "Pluto", color: 0xb9a589, type: "rocky", seed: 77, dwarf: true,
    distance: 150, size: 0.5, orbitPeriod: 248, rotationPeriod: 6.39, axialTilt: 122.5, tilt: 1.0,
    desc: "曾被列为第九大行星，2006 年被重新归类为矮行星。拥有心形的「汤博区」，由「新视野号」首次清晰拍摄。",
    stats: [["与日距离", "39.5 AU"], ["公转周期", "248 年"], ["自转轴倾角", "122.5°"], ["卫星", "5（冥卫一最大）"]],
  },
];
