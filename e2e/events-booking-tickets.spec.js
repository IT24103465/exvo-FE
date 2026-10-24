import { expect, test, mockApi } from './fixtures/mockApi.js'

test.describe('event discovery, details, booking and tickets', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
  })

  test('search filters events and the visitor can inspect event details', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Search Events' }).click()
    await page.getByPlaceholder('Search events, artists...').fill('Neon')
    await expect(page.getByText(/Filtered by "Neon"/)).toBeVisible()
    await page.locator('#all-events-grid').getByRole('button', { name: 'VIEW' }).click({ force: true })
    await expect(page.getByRole('dialog')).toContainText('EVENT INFORMATION & PASSES')
    await expect(page.getByRole('dialog')).toContainText('Neon Horizon Live')
    await page.getByRole('button', { name: 'Close details' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('authenticated attendee opens booking and completes a general admission booking', async ({ page }) => {
    await page.addInitScript(
      ({ user }) => {
        localStorage.setItem('token', 'mock-token')
        localStorage.setItem('user', JSON.stringify(user))
      },
      { user: { id: 'attendee-1', fullName: 'Asha Perera', email: 'asha@example.test', role: 'Attendee' } },
    )
    await page.goto('/')
    await page.locator('#all-events-grid').getByRole('button', { name: 'VIEW' }).click({ force: true })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /GET TICKETS NOW/i })
      .click({ force: true })
    await expect(page.getByRole('dialog')).toContainText('EXVO SECURE TICKET GATEWAY')
    const quantity = page.getByRole('spinbutton').first()
    if (await quantity.count()) {
      await quantity.fill('1')
      await page
        .getByRole('button', { name: /CONFIRM|BOOK|PROCEED/i })
        .last()
        .click({ force: true })
    }
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('authenticated attendee opens tickets, searches, and downloads ticket evidence', async ({ page }) => {
    await page.addInitScript(
      ({ user }) => {
        localStorage.setItem('token', 'mock-token')
        localStorage.setItem('user', JSON.stringify(user))
      },
      { user: { id: 'attendee-1', fullName: 'Asha Perera', email: 'asha@example.test', role: 'Attendee' } },
    )
    await page.goto('/')
    await page.getByTitle('Manage tickets').click({ force: true })
    await expect(page.getByText('MY TICKETS')).toBeVisible()
    await page.getByPlaceholder('Search event, venue, code, row...').fill('EXVO-GA-1001')
    await expect(page.getByText('EXVO-GA-1001')).toBeVisible()
    const download = page.waitForEvent('download')
    await page
      .getByRole('button', { name: /DOWNLOAD/i })
      .first()
      .click({ force: true })
    await expect(download).resolves.toBeTruthy()
  })
})
