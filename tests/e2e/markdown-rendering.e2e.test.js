import { test, expect } from '@playwright/test';

/**
 * INTEGRATION TEST: Markdown Rendering in Preview Mode
 *
 * Tests that markdown syntax is properly rendered in preview mode:
 * - Headings (H1-H6)
 * - Bold and italic text
 * - Lists (ordered and unordered)
 * - Inline code and code blocks
 * - Blockquotes
 * - Links
 * - Line breaks and paragraphs
 *
 * NO MOCKS - tests real markdown parsing and rendering in browser
 */

test.describe('INTEGRATION: Markdown Rendering in Preview Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });

    // Clear database for clean state
    await page.evaluate(async () => {
      await window.basaltDb.clearDatabase();
    });
    console.log('[TEST] Database cleared, reloading page');

    await page.reload();
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000 });
    await page.waitForTimeout(500);
  });

  test('Render headings (H1-H6) in preview mode', async ({ page }) => {
    console.log('[E2E] Starting headings rendering test');

    // Create note with heading markdown
    const noteTitle = `Headings Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    // Select note to edit
    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with all heading levels
    const markdownContent = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);

    // Save and switch to preview mode
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    // Verify preview mode is active (save automatically switches to preview)
    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify H1 is rendered
    const h1 = previewContainer.locator('h1:has-text("Heading 1")');
    await expect(h1).toBeVisible();

    // Verify H2 is rendered
    const h2 = previewContainer.locator('h2:has-text("Heading 2")');
    await expect(h2).toBeVisible();

    // Verify H3 is rendered
    const h3 = previewContainer.locator('h3:has-text("Heading 3")');
    await expect(h3).toBeVisible();

    // Verify H4 is rendered
    const h4 = previewContainer.locator('h4:has-text("Heading 4")');
    await expect(h4).toBeVisible();

    // Verify H5 is rendered
    const h5 = previewContainer.locator('h5:has-text("Heading 5")');
    await expect(h5).toBeVisible();

    // Verify H6 is rendered
    const h6 = previewContainer.locator('h6:has-text("Heading 6")');
    await expect(h6).toBeVisible();

    console.log('[E2E] ✓✓✓ MARKDOWN HEADINGS RENDERED!');
  });

  test('Render bold and italic text in preview mode', async ({ page }) => {
    console.log('[E2E] Starting bold/italic rendering test');

    // Create note
    const noteTitle = `Formatting Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with bold and italic
    const markdownContent = `This is **bold text** and this is *italic text*.
You can also use __bold__ and _italic_ syntax.
And even ***bold italic*** text.`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify bold text is rendered with <strong> or <b> tag
    const boldText = previewContainer.locator('strong:has-text("bold text"), b:has-text("bold text")');
    await expect(boldText).toBeVisible();

    // Verify italic text is rendered with <em> or <i> tag
    const italicText = previewContainer.locator('em:has-text("italic text"), i:has-text("italic text")');
    await expect(italicText).toBeVisible();

    console.log('[E2E] ✓✓✓ MARKDOWN BOLD/ITALIC RENDERED!');
  });

  test('Render unordered and ordered lists in preview mode', async ({ page }) => {
    console.log('[E2E] Starting lists rendering test');

    const noteTitle = `Lists Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with lists
    const markdownContent = `Unordered list:
- Item 1
- Item 2
- Item 3

Ordered list:
1. First item
2. Second item
3. Third item`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify unordered list is rendered
    const ul = previewContainer.locator('ul');
    await expect(ul).toBeVisible();

    const ulItems = ul.locator('li');
    await expect(ulItems).toHaveCount(3);

    // Verify ordered list is rendered
    const ol = previewContainer.locator('ol');
    await expect(ol).toBeVisible();

    const olItems = ol.locator('li');
    await expect(olItems).toHaveCount(3);

    console.log('[E2E] ✓✓✓ MARKDOWN LISTS RENDERED!');
  });

  test('Render inline code and code blocks in preview mode', async ({ page }) => {
    console.log('[E2E] Starting code rendering test');

    const noteTitle = `Code Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with code
    const markdownContent = `This is \`inline code\` in a sentence.

\`\`\`javascript
function hello() {
  console.log("Hello World");
}
\`\`\``;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify inline code is rendered
    const inlineCode = previewContainer.locator('code:has-text("inline code")');
    await expect(inlineCode).toBeVisible();

    // Verify code block is rendered
    const codeBlock = previewContainer.locator('pre').first();
    await expect(codeBlock).toBeVisible();

    // Verify code block contains the function
    const codeContent = await codeBlock.textContent();
    expect(codeContent).toContain('function hello');
    expect(codeContent).toContain('console.log');

    console.log('[E2E] ✓✓✓ MARKDOWN CODE RENDERED!');
  });

  test('Render blockquotes in preview mode', async ({ page }) => {
    console.log('[E2E] Starting blockquote rendering test');

    const noteTitle = `Blockquote Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with blockquote
    const markdownContent = `> This is a blockquote.
> It can span multiple lines.
>
> And have multiple paragraphs.`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify blockquote is rendered
    const blockquote = previewContainer.locator('blockquote');
    await expect(blockquote).toBeVisible();

    const blockquoteText = await blockquote.textContent();
    expect(blockquoteText).toContain('This is a blockquote');

    console.log('[E2E] ✓✓✓ MARKDOWN BLOCKQUOTE RENDERED!');
  });

  test('Render markdown links in preview mode', async ({ page }) => {
    console.log('[E2E] Starting links rendering test');

    const noteTitle = `Links Test ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(noteTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${noteTitle}")`).click();
    await page.waitForTimeout(300);

    // Add markdown with links
    const markdownContent = `Check out [OpenAI](https://openai.com) for more info.

You can also use [Anthropic](https://anthropic.com) as a reference.`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify links are rendered
    const openaiLink = previewContainer.locator('a:has-text("OpenAI")');
    await expect(openaiLink).toBeVisible();
    await expect(openaiLink).toHaveAttribute('href', 'https://openai.com');

    const anthropicLink = previewContainer.locator('a:has-text("Anthropic")');
    await expect(anthropicLink).toBeVisible();
    await expect(anthropicLink).toHaveAttribute('href', 'https://anthropic.com');

    console.log('[E2E] ✓✓✓ MARKDOWN LINKS RENDERED!');
  });

  test('Markdown rendering preserves wikilinks functionality', async ({ page }) => {
    console.log('[E2E] Starting markdown + wikilinks integration test');

    // Create target note
    const targetTitle = `Target Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(targetTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    const targetId = await page.evaluate(async (title) => {
      const result = await window.basaltDb.executeQuery(
        'SELECT note_id FROM notes WHERE title = ?',
        [title]
      );
      return result.rows[0].values[0].value;
    }, targetTitle);

    // Create source note with markdown AND wikilinks
    const sourceTitle = `Source Note ${Date.now()}`;
    await page.locator('[data-testid="note-title-input"]').fill(sourceTitle);
    await page.locator('[data-testid="new-note-button"]').click();
    await page.waitForTimeout(500);

    await page.locator(`[data-testid="note-item"]:has-text("${sourceTitle}")`).click();
    await page.waitForTimeout(300);

    // Mix markdown with wikilinks
    const markdownContent = `# My Note

This has **bold text** and a wikilink: [[${targetId}]]

- List item 1
- List item 2

And more \`inline code\` here.`;

    await page.locator('[data-testid="note-body-textarea"]').fill(markdownContent);
    await page.locator('[data-testid="save-note-button"]').click();
    await page.waitForTimeout(500);

    const previewContainer = page.locator('[data-testid="note-preview"]');
    await expect(previewContainer).toBeVisible();

    // Verify markdown is rendered
    const heading = previewContainer.locator('h1:has-text("My Note")');
    await expect(heading).toBeVisible();

    const bold = previewContainer.locator('strong:has-text("bold text"), b:has-text("bold text")');
    await expect(bold).toBeVisible();

    // Verify wikilink still works and is clickable
    const wikilink = previewContainer.locator('[data-testid="wikilink"]');
    await expect(wikilink).toBeVisible();

    // Verify wikilink shows target note title
    const wikilinkText = await wikilink.textContent();
    expect(wikilinkText).toBe(targetTitle);

    // Click wikilink and verify navigation
    await wikilink.click();
    await page.waitForTimeout(500);

    // Verify we navigated to target note (should be in edit mode)
    const titleInput = page.locator('[data-testid="editor-note-title"]');
    await expect(titleInput).toHaveValue(targetTitle);

    console.log('[E2E] ✓✓✓ MARKDOWN + WIKILINKS INTEGRATION WORKS!');
  });
});
