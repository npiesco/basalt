// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * INTEGRATION TEST: Responsive Mobile UI
 *
 * Tests that the PWA is mobile-friendly:
 * - Collapsible sidebars on small screens
 * - Floating add button for quick note creation
 * - Touch-friendly button sizes (min 44x44px)
 * - Proper viewport scaling
 * - Swipe gestures for navigation
 *
 * NO MOCKS - tests real mobile UI behavior
 */

test.describe('INTEGRATION: Responsive Mobile UI', () => {
  test('Mobile viewport shows collapsible sidebars and floating button', async ({ page }) => {
    console.log('[E2E] Starting mobile responsive test');

    // Set mobile viewport (iPhone SE)
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ App loaded on mobile viewport (375x667)');

    // VERIFY: Left sidebar is hidden by default on mobile
    const leftSidebar = page.locator('[data-testid="left-sidebar"]');
    const leftSidebarVisible = await leftSidebar.isVisible();

    if (leftSidebarVisible) {
      // Check if it's off-screen (transformed or negative margin)
      const leftSidebarBox = await leftSidebar.boundingBox();
      const className = await leftSidebar.getAttribute('class');
      const computedStyle = await leftSidebar.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          position: style.position,
          left: style.left,
          transform: style.transform,
          display: style.display
        };
      });
      console.log('[E2E] DEBUG: Left sidebar bounding box:', leftSidebarBox);
      console.log('[E2E] DEBUG: Left sidebar className:', className);
      console.log('[E2E] DEBUG: Left sidebar computed style:', computedStyle);
      const isOffScreen = leftSidebarBox && leftSidebarBox.x < 0;
      expect(isOffScreen).toBe(true);
      console.log('[E2E] ✓ Left sidebar hidden off-screen on mobile');
    } else {
      console.log('[E2E] ✓ Left sidebar display:none on mobile');
    }

    // VERIFY: Right sidebar is hidden by default on mobile
    const rightSidebar = page.locator('[data-testid="right-sidebar"]');
    const rightSidebarVisible = await rightSidebar.isVisible();

    if (rightSidebarVisible) {
      const rightSidebarBox = await rightSidebar.boundingBox();
      const isOffScreen = rightSidebarBox && rightSidebarBox.x >= 375;
      expect(isOffScreen).toBe(true);
      console.log('[E2E] ✓ Right sidebar hidden off-screen on mobile');
    } else {
      console.log('[E2E] ✓ Right sidebar display:none on mobile');
    }

    // VERIFY: Toggle button for left sidebar exists
    const leftToggleButton = page.locator('[data-testid="toggle-left-sidebar"]');
    await expect(leftToggleButton).toBeVisible();
    console.log('[E2E] ✓ Left sidebar toggle button visible');

    // VERIFY: Floating add button exists on mobile
    const floatingAddButton = page.locator('[data-testid="floating-add-button"]');
    await expect(floatingAddButton).toBeVisible();
    console.log('[E2E] ✓ Floating add button visible on mobile');

    // VERIFY: Floating button is positioned fixed at bottom right
    const floatingButtonBox = await floatingAddButton.boundingBox();
    expect(floatingButtonBox).toBeTruthy();
    if (floatingButtonBox) {
      expect(floatingButtonBox.x).toBeGreaterThan(250); // Right side (375px viewport - button - margin)
      expect(floatingButtonBox.y).toBeGreaterThan(580); // Bottom (667px viewport - button - margin)
      console.log('[E2E] ✓ Floating button positioned at bottom-right');
    }

    console.log('[E2E] ✓ MOBILE VIEWPORT LAYOUT VALIDATED');
  });

  test('Toggle buttons show and hide sidebars on mobile', async ({ page }) => {
    console.log('[E2E] Starting sidebar toggle test');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Click left sidebar toggle to show
    const leftToggle = page.locator('[data-testid="toggle-left-sidebar"]');
    await leftToggle.click();
    await page.waitForTimeout(500); // Wait for animation

    console.log('[E2E] ✓ Clicked left sidebar toggle');

    // VERIFY: Left sidebar is now visible/on-screen
    const leftSidebar = page.locator('[data-testid="left-sidebar"]');
    const isVisibleNow = await leftSidebar.isVisible();
    expect(isVisibleNow).toBe(true);

    const leftBox = await leftSidebar.boundingBox();
    const isOnScreen = leftBox && leftBox.x >= 0 && leftBox.x < 375;
    expect(isOnScreen).toBe(true);
    console.log('[E2E] ✓ Left sidebar visible after toggle');

    // Click toggle again to hide
    await leftToggle.click();
    await page.waitForTimeout(500);

    const leftBoxAfter = await leftSidebar.boundingBox();
    const isOffScreenAgain = leftBoxAfter && leftBoxAfter.x < 0;
    expect(isOffScreenAgain).toBe(true);
    console.log('[E2E] ✓ Left sidebar hidden after second toggle');

    console.log('[E2E] ✓ SIDEBAR TOGGLE FUNCTIONALITY VALIDATED');
  });

  test('Floating add button creates new note on mobile', async ({ page }) => {
    console.log('[E2E] Starting floating button test');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Count initial notes
    const initialNotes = await page.locator('[data-testid="note-item"]').count();
    console.log('[E2E] Initial note count:', initialNotes);

    // Click floating add button
    const floatingButton = page.locator('[data-testid="floating-add-button"]');
    await floatingButton.click();
    await page.waitForTimeout(300);

    console.log('[E2E] ✓ Clicked floating add button');

    // VERIFY: Quick add dialog or input appears
    const quickAddDialog = page.locator('[data-testid="quick-add-dialog"]');
    await expect(quickAddDialog).toBeVisible();
    console.log('[E2E] ✓ Quick add dialog appeared');

    // Fill in note title
    const quickTitleInput = page.locator('[data-testid="quick-add-title"]');
    const mobileNoteTitle = `Mobile Note ${Date.now()}`;
    await quickTitleInput.fill(mobileNoteTitle);

    // Submit
    const quickAddSubmit = page.locator('[data-testid="quick-add-submit"]');
    await quickAddSubmit.click();
    await page.waitForTimeout(500);

    console.log('[E2E] ✓ Created note via floating button:', mobileNoteTitle);

    // VERIFY: Note appears in list (need to open sidebar to see it)
    const leftToggle = page.locator('[data-testid="toggle-left-sidebar"]');
    await leftToggle.click();
    await page.waitForTimeout(300);

    const newNote = page.locator(`[data-testid="note-item"]`, {
      hasText: mobileNoteTitle
    });
    await expect(newNote).toBeVisible();
    console.log('[E2E] ✓ New note visible in list');

    console.log('[E2E] ✓ FLOATING ADD BUTTON FUNCTIONALITY VALIDATED');
  });

  test('Touch targets are large enough for fingers (min 44x44px)', async ({ page }) => {
    console.log('[E2E] Starting touch target size test');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });

    // Check floating add button size
    const floatingButton = page.locator('[data-testid="floating-add-button"]');
    const floatingBox = await floatingButton.boundingBox();

    expect(floatingBox).toBeTruthy();
    if (floatingBox) {
      expect(floatingBox.width).toBeGreaterThanOrEqual(44);
      expect(floatingBox.height).toBeGreaterThanOrEqual(44);
      console.log('[E2E] ✓ Floating button:', `${Math.round(floatingBox.width)}x${Math.round(floatingBox.height)}px (✓ >=44x44px)`);
    }

    // Check toggle button size
    const toggleButton = page.locator('[data-testid="toggle-left-sidebar"]');
    const toggleBox = await toggleButton.boundingBox();

    expect(toggleBox).toBeTruthy();
    if (toggleBox) {
      expect(toggleBox.width).toBeGreaterThanOrEqual(44);
      expect(toggleBox.height).toBeGreaterThanOrEqual(44);
      console.log('[E2E] ✓ Toggle button:', `${Math.round(toggleBox.width)}x${Math.round(toggleBox.height)}px (✓ >=44x44px)`);
    }

    // Create a note to check note item touch target
    const floatingAdd = page.locator('[data-testid="floating-add-button"]');
    await floatingAdd.click();
    await page.waitForTimeout(200);

    const quickTitleInput = page.locator('[data-testid="quick-add-title"]');
    await quickTitleInput.fill('Touch Target Test Note');

    const submitButton = page.locator('[data-testid="quick-add-submit"]');
    await submitButton.click();
    await page.waitForTimeout(500);

    // Open sidebar to check note item
    const leftToggle = page.locator('[data-testid="toggle-left-sidebar"]');
    await leftToggle.click();
    await page.waitForTimeout(300);

    const noteItem = page.locator('[data-testid="note-item"]').first();
    const noteBox = await noteItem.boundingBox();

    expect(noteBox).toBeTruthy();
    if (noteBox) {
      expect(noteBox.height).toBeGreaterThanOrEqual(44);
      console.log('[E2E] ✓ Note item height:', `${Math.round(noteBox.height)}px (✓ >=44px)`);
    }

    console.log('[E2E] ✓ ALL TOUCH TARGETS ARE FINGER-FRIENDLY');
  });

  test('Desktop viewport shows both sidebars by default', async ({ page }) => {
    console.log('[E2E] Starting desktop viewport test');

    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 10000 });
    console.log('[E2E] ✓ App loaded on desktop viewport (1280x720)');

    // VERIFY: Both sidebars are visible on desktop
    const leftSidebar = page.locator('[data-testid="left-sidebar"]');
    await expect(leftSidebar).toBeVisible();
    console.log('[E2E] ✓ Left sidebar visible on desktop');

    const rightSidebar = page.locator('[data-testid="right-sidebar"]');
    await expect(rightSidebar).toBeVisible();
    console.log('[E2E] ✓ Right sidebar visible on desktop');

    // VERIFY: Toggle buttons are hidden on desktop (or not present)
    const leftToggle = page.locator('[data-testid="toggle-left-sidebar"]');
    const toggleVisible = await leftToggle.isVisible().catch(() => false);
    expect(toggleVisible).toBe(false);
    console.log('[E2E] ✓ Toggle buttons hidden on desktop');

    // VERIFY: Floating add button is hidden on desktop
    const floatingButton = page.locator('[data-testid="floating-add-button"]');
    const floatingVisible = await floatingButton.isVisible().catch(() => false);
    expect(floatingVisible).toBe(false);
    console.log('[E2E] ✓ Floating add button hidden on desktop');

    console.log('[E2E] ✓ DESKTOP LAYOUT VALIDATED');
  });
});
