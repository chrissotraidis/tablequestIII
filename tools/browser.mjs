import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

// Use the installed browser when Playwright's optional download is absent.
// Software rendering is opt-in; it cannot measure this Mac's GPU pacing.
export function launchBrowser() {
    const executablePath = process.env.TQ_BROWSER_PATH || [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ].find(existsSync);
    return chromium.launch({ executablePath, headless: true, args: [
        '--autoplay-policy=no-user-gesture-required',
        ...(process.env.TQ_SOFTWARE_RENDERER === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
    ] });
}
