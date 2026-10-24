import { expect, test } from '@playwright/test'

const required = ['EXVO_E2E_ATTENDEE_EMAIL', 'EXVO_E2E_ATTENDEE_PASSWORD']
const configured = required.every((name) => Boolean(process.env[name]) && Boolean(process.env.EXVO_E2E_BASE_URL))

test.describe('real EXVO backend integration', () => {
  test.skip(
    !configured,
    'Set EXVO_E2E_BASE_URL and isolated EXVO_E2E_ATTENDEE_* credentials to run real integration E2E.',
  )

  test('isolated attendee can authenticate and read backend events without API mocks', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click()
    await page.getByRole('button', { name: 'LOGIN' }).click()
    await page.getByLabel('EMAIL / USERNAME').fill(process.env.EXVO_E2E_ATTENDEE_EMAIL)
    await page.getByLabel('PASSWORD').fill(process.env.EXVO_E2E_ATTENDEE_PASSWORD)
    await page.getByRole('button', { name: 'LOGIN TO EXVO' }).click()
    await expect(page.getByRole('button', { name: 'Manage tickets' })).toBeVisible()
    await expect(page.locator('#all-events-grid')).toBeVisible()
  })
})
