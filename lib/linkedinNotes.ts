export type SimplePerson = {
  id: string
  first_name?: string | null
  name?: string | null
}

/**
 * "Hi [FirstName], it's always nice to meet others passionate about the industry.
 *  Would be great to connect."
 *
 * - Falls back to "there" when first name is unknown.
 */
export function makeStaticNote(p: SimplePerson) {
  const first =
    (p.first_name ?? '').trim() ||
    (p.name?.split(' ')?.[0] ?? '').trim() ||
    'there'

  return `Hi ${first}, it's always nice to meet others passionate about the industry. Would be great to connect.`
}
