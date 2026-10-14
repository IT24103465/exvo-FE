import { expect, test } from '@playwright/test'

test('visitor can open the homepage navigation and login form', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.goto('/')
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle Navigation Menu' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click()
  await expect(page.getByRole('button', { name: 'LOGIN' })).toBeVisible()
  await page.getByRole('button', { name: 'LOGIN' }).click()

  await expect(page.getByLabel('EMAIL / USERNAME')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'PASSWORD' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'LOGIN TO EXVO' })).toBeVisible()
})
