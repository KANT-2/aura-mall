import type { Page } from "@playwright/test";

export type MotionWindow = Window & { resolveMotion?: (value: string) => void };
export async function mockMotion(page: Page, permission: "granted" | "denied" | "pending") {
  await page.addInitScript((mode) => {
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: class extends Event {
        static requestPermission() {
          return mode === "pending"
            ? new Promise<string>((resolve) => {
                (window as MotionWindow).resolveMotion = resolve;
              })
            : Promise.resolve(mode);
        }
      },
    });
  }, permission);
}

export async function emitShake(page: Page) {
  await page.evaluate(() => {
    const event = new Event("devicemotion");
    Object.defineProperties(event, {
      acceleration: { value: { x: 10, y: 0, z: 0 } },
      accelerationIncludingGravity: { value: null },
    });
    window.dispatchEvent(event);
  });
}
