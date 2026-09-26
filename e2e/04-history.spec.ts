import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('device history switches to 7 days and renders a chart', async ({ page }) => {
  await login(page)
  await page.goto('/devices')
  await page.locator('table').getByRole('link', { name: /Work Laptop/ }).click()
  await page.waitForURL(/\/devices\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Work Laptop' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Throughput over 24h/ })).toBeVisible()

  await page.getByRole('radio', { name: '7d' }).click()
  await expect(page.getByText('Hourly averages')).toBeVisible()
  const chart = page.getByRole('img', { name: /Throughput over 7d/ })
  await expect(chart).toBeVisible()
  await expect(chart.locator('path.recharts-area-area').first()).toBeVisible()
})
