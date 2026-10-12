import { expect, test } from 'vitest'
import {
  canSelectSeatForTicketTier,
  seatingAllocationErrors,
  seatingConfigToBookingPlan,
} from './seatingPlanAdapter.js'

test('keeps temporary ticket tier IDs out of the integer API contract', () => {
  const plan = seatingConfigToBookingPlan(
    {
      enabled: true,
      zones: [
        {
          name: 'Early Bird',
          ticketTierId: '1760000000000',
          rows: ['A', 'B'],
          seatsPerRow: 10,
          price: 2500,
        },
      ],
    },
    [{ id: '1760000000000', name: 'Early Bird', price: 2500 }],
  )

  expect(plan.sections[0].ticketTierId).toBeNull()
})

test('preserves valid backend ticket tier IDs', () => {
  const plan = seatingConfigToBookingPlan(
    { zones: [{ name: 'Early Bird', ticketTierId: '12', rows: ['A'], seatsPerRow: 10 }] },
    [{ id: '13', name: 'Early Bird', price: 2500 }],
  )

  expect(plan.sections[0].ticketTierId).toBe(12)
})

test('keeps explicitly entered row labels and allows more than 50 seats', () => {
  const config = {
    enabled: true,
    zones: [{ name: 'VIP', rows: ['A', 'C', 'E'], seatsPerRow: 17, price: 5000 }],
  }
  const plan = seatingConfigToBookingPlan(config, [{ name: 'VIP', price: 5000 }])

  expect(plan.sections[0].rowLabels).toEqual(['A', 'C', 'E'])
  expect(seatingAllocationErrors(config, [{ name: 'VIP', price: 5000, quantity: '' }])).toEqual([])
})

test('allows unlimited ticket quantities while limiting finite seated tiers to their ticket quantity', () => {
  const config = {
    enabled: true,
    zones: [{ name: 'Standard', rows: ['A', 'B'], seatsPerRow: 5, price: 2500 }],
  }

  expect(seatingAllocationErrors(config, [{ name: 'Standard', price: 2500, quantity: '' }])).toEqual([])
  expect(seatingAllocationErrors(config, [{ name: 'Standard', price: 2500, quantity: '8' }])).toContain(
    'Standard has more seats than its ticket quantity.',
  )
  expect(seatingAllocationErrors(config, [{ name: 'Standard', price: 2500, quantity: '51' }])).toEqual([])
})

test('caps seats per row while allowing more than 50 seats per tier', () => {
  const tier = { id: 'vip', name: 'VIP', price: 5000, quantity: '' }
  expect(
    seatingAllocationErrors(
      {
        enabled: true,
        zones: [{ name: 'VIP', rows: ['A'], seatsPerRow: 21, price: 5000 }],
      },
      [tier],
    ),
  ).toContain('Seating zone VIP cannot have more than 20 seats per row.')

  expect(
    seatingAllocationErrors(
      {
        enabled: true,
        zones: [
          { ticketTierId: 'vip', name: 'VIP', rows: ['A'], seatsPerRow: 20, price: 5000 },
          { ticketTierId: 'vip', name: 'VIP', rows: ['B'], seatsPerRow: 20, price: 5000 },
          { ticketTierId: 'vip', name: 'VIP', rows: ['C'], seatsPerRow: 20, price: 5000 },
        ],
      },
      [tier],
    ),
  ).toEqual([])
})

test('seat selection limit is enforced independently for each ticket price tier', () => {
  const standard = { id: 1, price: 2500 }
  const vip = { id: 2, price: 5000 }
  const selected = [{ seatCode: 'A-01', price: 2500 }]

  expect(canSelectSeatForTicketTier({ price: 2500 }, standard, selected, 1)).toBe(false)
  expect(canSelectSeatForTicketTier({ price: 5000 }, vip, selected, 1)).toBe(true)
})
