import { defineConfig } from "@playwright/test";

// 三种终端在同一套用例上跑：电脑 / 平板 / 手机。
// 用 Chromium 的移动模拟（isMobile + hasTouch）来触发站点里
// `matchMedia("(pointer: coarse)")` 的移动端分支，验证响应式与触屏逻辑。
const WEBGL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader", // CI 无显卡，用软件渲染保证 WebGL 可用
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // 失败留痕：HTML 报告 + 列表输出
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: { args: WEBGL_ARGS },
  },
  // 自动起一个静态服务器伺服仓库根目录（纯静态站点，无需构建）
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "Desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, isMobile: false },
    },
    {
      name: "Tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 820, height: 1180 },
        isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      },
    },
    {
      name: "Mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true, deviceScaleFactor: 3,
      },
    },
  ],
});
