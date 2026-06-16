import { test, expect } from "@playwright/test";

// 与设备无关的噪声（不计为错误）：CI 软件渲染的 WebGL 性能告警、缺失的 favicon 等
const IGNORE = [/favicon/i, /SwiftShader/i, /Automatic fallback to software WebGL/i];
const isNoise = (t) => IGNORE.some((re) => re.test(t));

test("加载无报错 + 关键交互 + 截图", async ({ page }, info) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (!isNoise(e.message)) errors.push("pageerror: " + e.message); });

  await page.goto("/", { waitUntil: "load" });

  // 应用初始化完成的信号：加载遮罩被加上 .hidden
  await page.waitForSelector("#loading.hidden", { timeout: 30_000 });
  await page.waitForTimeout(2000); // 让场景渲染几帧，暴露运行时错误

  const touch = info.project.name !== "Desktop";

  // 设备相关断言：触屏设备应隐藏「自由飞行」（依赖键鼠，移动端不可用）
  await expect(
    page.locator("#fly-toggle"),
    `自由飞行按钮在 ${info.project.name} 应${touch ? "隐藏" : "显示"}`
  ).toBeVisible({ visible: !touch });

  // 导览：打开 → 字幕条出现 → 下一站 → 暂停
  await page.locator("#tour-toggle").click();
  await expect(page.locator("#tour-bar")).toBeVisible();
  await expect(page.locator("#tour-subtitle")).not.toBeEmpty();
  await page.locator("#tour-next").click();
  await expect(page.locator("#tour-step")).toContainText("/ 9 站");
  await page.locator("#tour-pause").click();
  await expect(page.locator("#tour-pause")).toHaveText("▶");

  // 截图存档（按设备命名，附到测试报告）
  const shot = info.outputPath(`${info.project.name}.png`);
  await page.screenshot({ path: shot });
  await info.attach(`${info.project.name} 截图`, { path: shot, contentType: "image/png" });

  expect(errors, "控制台错误：\n" + errors.join("\n")).toEqual([]);
});
