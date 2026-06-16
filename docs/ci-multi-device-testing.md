# 多端自动化测试方案（Playwright + GitHub Actions）

> 一份可复用的「每次 push 自动在电脑/平板/手机三端跑测试、抓报错、出截图」方案。
> 本文档既是本项目的说明，也是搬到其他前端/静态项目的模板。

---

## 1. 它解决什么问题

本地常常**装不了浏览器**（网络受限、CI 沙箱无显卡），或者**懒得每次手动开三种设备点一遍**。
这套方案把测试交给云端：

| 能力 | 说明 |
|---|---|
| 🔴 抓运行时报错 | 监听 `console` 红错 + `pageerror`，任一端崩溃就判失败 |
| 🧪 验证关键功能 | 用断言确认核心交互还在（按钮、流程、响应式分支） |
| 📸 出截图 | 电脑/平板/手机各截一张，存进报告供肉眼核对布局 |
| ♻️ 回归哨兵 | 每次 push/PR 自动跑，改坏了立刻红叉报警 |

**边界**：它查的是「会崩 / 报错 / 功能消失」这类硬问题，**查不了审美**（颜色、间距、动画顺滑度仍需人看截图）。

---

## 2. 名词速览

- **CI（持续集成）**：每次推代码，服务器自动拉取→装环境→跑测试→反馈结果。
- **GitHub Actions**：GitHub 免费提供的云 Ubuntu，按 `.github/workflows/*.yml` 剧本执行。
- **Playwright**：微软的浏览器自动化库，用代码驱动真实浏览器：打开页面、点按钮、截图、监听报错。
- **Artifact（产物）**：CI 跑完上传的可下载文件，这里用来存测试报告 + 截图。

---

## 3. 文件结构与职责

```
.github/workflows/e2e.yml   # 剧本：何时跑、跑什么步骤
playwright.config.js        # 设备定义：三套视口 + 浏览器启动参数
tests/smoke.spec.js         # 测试用例：检查哪些东西
package.json                # 声明 @playwright/test 依赖
.gitignore                  # 忽略 node_modules / 测试产物
```

---

## 4. 执行逻辑（一次 push 后发生了什么）

```
push
 └─> GitHub Actions 启动云 Ubuntu，按 e2e.yml：
      ① checkout            拉代码
      ② setup-node          装 Node
      ③ npm install         装 Playwright
      ④ playwright install  下载 Chromium（本地装不了，云上能下）
      ⑤ playwright test     ← 核心
           ├─ 起静态服务器伺服站点（python3 -m http.server）
           ├─ Desktop / Tablet / Mobile 三套视口各跑一遍同一份用例
           └─ 监听报错 + 断言交互 + 截图
      ⑥ upload-artifact     成败都上传报告+截图
```

**怎么模拟平板/手机？** 给 Chromium 设 `isMobile: true, hasTouch: true` + 对应视口，
浏览器会上报 `pointer: coarse`，从而触发站点里 `matchMedia("(pointer: coarse)")` 的移动端分支——与真机走同一代码路径。

---

## 5. 可复用模板（直接复制改）

### 5.1 `package.json`（若已有则只加 devDependencies 与 scripts）

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

### 5.2 `playwright.config.js`

要点：① 三视口 projects；② Chromium 软件渲染参数（CI 无显卡也能跑 WebGL，**非 WebGL 项目可删**）；
③ `webServer` 自动起站点——**静态站用 `python3 -m http.server`，有构建的项目改成 `npm run dev/preview`**。

```js
import { defineConfig } from "@playwright/test";

const WEBGL_ARGS = [ // 仅 WebGL/Canvas 项目需要；纯 DOM 项目可整段删掉 launchOptions
  "--use-gl=angle", "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
];

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL: "http://127.0.0.1:4173", launchOptions: { args: WEBGL_ARGS } },
  webServer: {
    command: "python3 -m http.server 4173", // 有构建：换成 "npm run preview" 等
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "Desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, isMobile: false } },
    { name: "Tablet",  use: { browserName: "chromium", viewport: { width: 820,  height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "Mobile",  use: { browserName: "chromium", viewport: { width: 390,  height: 844  }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
});
```

### 5.3 `tests/smoke.spec.js`（按自己项目改断言）

通用骨架——**保留报错监听 + 截图，把中间的交互断言换成你项目的关键路径**：

```js
import { test, expect } from "@playwright/test";

const IGNORE = [/favicon/i, /SwiftShader/i]; // 噪声白名单
const isNoise = (t) => IGNORE.some((re) => re.test(t));

test("加载无报错 + 关键交互 + 截图", async ({ page }, info) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (!isNoise(e.message)) errors.push("pageerror: " + e.message); });

  await page.goto("/", { waitUntil: "load" });
  await page.waitForSelector("#loading.hidden", { timeout: 30_000 }); // ← 换成你项目的"就绪信号"
  await page.waitForTimeout(2000);

  // —— 在这里写你项目的关键交互断言 ——
  // 例：触屏分支、表单提交、路由跳转……

  const shot = info.outputPath(`${info.project.name}.png`);
  await page.screenshot({ path: shot });
  await info.attach(`${info.project.name} 截图`, { path: shot, contentType: "image/png" });

  expect(errors, "控制台错误：\n" + errors.join("\n")).toEqual([]);
});
```

### 5.4 `.github/workflows/e2e.yml`

```yaml
name: E2E 多端实测 (Playwright)
on: [push, pull_request, workflow_dispatch]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

### 5.5 `.gitignore` 追加

```
/test-results/
/playwright-report/
/playwright/.cache/
```

---

## 6. 怎么看结果

1. push 后进 GitHub 仓库 **Actions** 标签页，找「E2E 多端实测」这次运行；
2. 绿勾 ✅ = 三端都正常；红叉 ❌ = 点进去看日志，直接定位到挂在哪一步、哪台设备；
3. 页面底部 **Artifacts → playwright-report** 下载解压，用浏览器打开 `index.html`，看三端截图与逐步结果。

本地复跑（装得了浏览器时）：

```bash
npm install
npx playwright install chromium
npm run test:e2e   # 跑
npm run report     # 看报告
```

---

## 7. 搬到新项目的清单

- [ ] 复制 `playwright.config.js` / `tests/` / `.github/workflows/e2e.yml`
- [ ] `package.json` 加 `@playwright/test` 与 scripts
- [ ] `webServer.command` 改成该项目的启动方式（静态站 / `npm run preview` / 其他端口）
- [ ] 非 WebGL 项目：删掉 `launchOptions` 那段软件渲染参数
- [ ] 把 `#loading.hidden` 换成你项目的「就绪信号」，并补上关键交互断言
- [ ] `.gitignore` 追加测试产物目录
- [ ] （可选）`on:` 收窄为 `pull_request` 或限定分支，省 Actions 额度
- [ ] （可选）需要 Safari/Firefox 真内核时，给 projects 加 `browserName: "webkit"/"firefox"` 并在 install 步骤补上对应浏览器
