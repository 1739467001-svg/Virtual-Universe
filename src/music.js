// 程序化太空氛围音乐（Web Audio，无需任何音频素材，离线可用、无版权问题）。
// 支持音量调节与多种「氛围」：深空(低沉) / 默认 / 星际旅行(明亮)。
// 结构：暖 pad 铺底(detune 叠加) + 五声音阶随机点缀音粒 + 反馈延迟空间感 + LFO 扫滤波。

const MOODS = {
  deep: { // 深空：低八度、暗滤波、稀疏点缀
    pad: [55.0, 82.41, 110.0, 123.47, 146.83],
    twinkle: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0],
    filterBase: 420, lfoDepth: 200, lfoRate: 0.035,
    padType: "triangle", twinkleType: "sine",
    twMin: 4000, twMax: 11000, padGain: 0.15, swellRate: 0.022,
  },
  default: { // 默认：中性氛围
    pad: [110.0, 164.81, 220.0, 246.94, 293.66],
    twinkle: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66],
    filterBase: 700, lfoDepth: 350, lfoRate: 0.05,
    padType: "triangle", twinkleType: "sine",
    twMin: 2000, twMax: 7000, padGain: 0.12, swellRate: 0.03,
  },
  travel: { // 星际旅行：高亮、含大三度、点缀密集
    pad: [146.83, 220.0, 293.66, 369.99, 440.0],
    twinkle: [587.33, 659.25, 783.99, 880.0, 987.77, 1174.66, 1318.51, 1567.98],
    filterBase: 1500, lfoDepth: 550, lfoRate: 0.07,
    padType: "sawtooth", twinkleType: "triangle",
    twMin: 1200, twMax: 4200, padGain: 0.10, swellRate: 0.045,
  },
};

export function createAmbientMusic() {
  let ctx = null, master = null, padFilter = null, lfo = null, lfoGain = null,
      padGain = null, swell = null;
  const padOscs = []; // { osc, i, det }
  let playing = false, twinkleTimer = null;
  let userVol = 0.6;            // 0~1，用户音量
  let mood = MOODS.default, moodKey = "default";

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // 反馈延迟（空间感）
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.55;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);

    // 低通 + LFO 扫截止频率
    padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = mood.filterBase;
    padFilter.Q.value = 0.7;
    padFilter.connect(master);
    padFilter.connect(delay);

    lfo = ctx.createOscillator();
    lfoGain = ctx.createGain();
    lfo.frequency.value = mood.lfoRate;
    lfoGain.gain.value = mood.lfoDepth;
    lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency);
    lfo.start();

    // pad：每个音两把略 detune 的振荡器
    padGain = ctx.createGain();
    padGain.gain.value = mood.padGain;
    padGain.connect(padFilter);
    mood.pad.forEach((f, i) => {
      for (const det of [-4, 5]) {
        const o = ctx.createOscillator();
        o.type = mood.padType;
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.5 / mood.pad.length;
        o.connect(g); g.connect(padGain);
        o.start();
        padOscs.push({ osc: o, i, det });
      }
    });

    // 主音量缓慢呼吸
    swell = ctx.createOscillator();
    const swellGain = ctx.createGain();
    swell.frequency.value = mood.swellRate;
    swellGain.gain.value = 0.04;
    swell.connect(swellGain); swellGain.connect(master.gain);
    swell.start();
  }

  function applyMood() {
    if (!ctx) return;
    const t = ctx.currentTime;
    padFilter.frequency.setTargetAtTime(mood.filterBase, t, 1.5);
    lfo.frequency.setTargetAtTime(mood.lfoRate, t, 1.0);
    lfoGain.gain.setTargetAtTime(mood.lfoDepth, t, 1.0);
    padGain.gain.setTargetAtTime(mood.padGain, t, 1.0);
    swell.frequency.setTargetAtTime(mood.swellRate, t, 1.0);
    for (const p of padOscs) {
      p.osc.type = mood.padType;
      p.osc.frequency.setTargetAtTime(mood.pad[p.i], t, 1.2); // 平滑滑音切换
    }
  }

  function twinkle() {
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    const f = mood.twinkle[(Math.random() * mood.twinkle.length) | 0];
    const o = ctx.createOscillator();
    o.type = mood.twinkleType;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    o.connect(g); g.connect(pan); pan.connect(padFilter); pan.connect(master);
    o.start(now); o.stop(now + 2.4);
    twinkleTimer = setTimeout(twinkle, mood.twMin + Math.random() * (mood.twMax - mood.twMin));
  }

  function rampMaster(target, time) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(Math.max(target, 0.0001), now + time);
  }

  function start() {
    if (playing) return;
    if (!ctx) build();
    playing = true;
    ctx.resume?.();
    rampMaster(userVol, 4);
    twinkleTimer = setTimeout(twinkle, 1500);
  }
  function stop() {
    if (!playing || !ctx) return;
    playing = false;
    clearTimeout(twinkleTimer);
    rampMaster(0.0001, 1.5);
  }
  function toggle() { playing ? stop() : start(); return playing; }

  function setVolume(v) {
    userVol = Math.max(0, Math.min(1, v));
    if (playing && ctx) rampMaster(userVol, 0.3);
  }
  function setMood(key) {
    if (!MOODS[key]) return;
    moodKey = key;
    mood = MOODS[key];
    applyMood();
  }

  return {
    start, stop, toggle, setVolume, setMood,
    get playing() { return playing; },
    get mood() { return moodKey; },
  };
}
