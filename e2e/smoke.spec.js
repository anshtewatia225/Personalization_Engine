import { test, expect } from '@playwright/test'

test('renders the app with a live rule-engine decision', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Shopper Intent Engine' })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toBeVisible()
  const decision = page.locator('section', { has: page.getByRole('heading', { name: 'Decision' }) })
  await expect(decision).toBeVisible()
})

test('switching analysis tabs updates the panel', async ({ page }) => {
  await page.goto('/')
  const rulesTab = page.getByRole('tab', { name: 'Rules' })
  await rulesTab.click()
  await expect(rulesTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(/Vote tally/)).toBeVisible()
})

test('tabs support arrow-key navigation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Signals' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Rules' })).toHaveAttribute('aria-selected', 'true')
})

test('loading a preset updates the decision', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Window Shopper/ }).click()
  const decision = page.locator('section', { has: page.getByRole('heading', { name: 'Decision' }) })
  await expect(decision.getByText('Browser', { exact: true }).first()).toBeVisible()
})

test('adding an event updates the stream', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/Event detail/).fill('added a gift note XYZ123')
  await page.getByRole('button', { name: 'Add event' }).click()
  await expect(page.getByText('added a gift note XYZ123', { exact: true })).toBeVisible()
})
