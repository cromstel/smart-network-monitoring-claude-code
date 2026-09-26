import { expect, test } from '@playwright/test'
import { ADMIN } from './helpers'

test('first-run setup creates the admin and lands on the dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await page.getByLabel('Your name').fill(ADMIN.name)
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByLabel('Confirm password').fill(ADMIN.password)
  await page.getByRole('button', { name: /create admin/i }).click()
  await expect(page.getByRole('heading', { name: /on your network/ })).toBeVisible()

  // Setup is closed now.
  const status = await page.request.get('/api/setup/status')
  expect(status.status()).toBe(409)
})
