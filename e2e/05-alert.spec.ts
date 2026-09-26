import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('a bandwidth alert rule fires and the notification appears', async ({ page }) => {
  await login(page)
  await page.goto('/alerts')
  await page.getByRole('tab', { name: 'My rules' }).click()
  await page.getByRole('button', { name: 'New rule' }).first().click()
  await page.getByLabel(/Bandwidth threshold/).check()
  await page.getByLabel('Threshold (Mbps)').fill('0.5')
  await page.getByRole('button', { name: 'Create rule' }).click()
  await expect(page.getByText(/> 0.5 Mbps/)).toBeVisible()

  // The startup scan recorded counter baselines; this scan measures speeds and evaluates rules.
  const scan = await page.request.post('/api/devices/scan')
  expect(scan.ok()).toBeTruthy()

  await page.getByRole('tab', { name: 'Activity log' }).click()
  await expect(page.getByText(/exceeded 0.5 Mbps/).first()).toBeVisible({ timeout: 20_000 })
})
