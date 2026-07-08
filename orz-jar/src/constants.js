// the 4 fixed members. colors are the Marginalia palette, kept in code so the look
// is easy to tweak without another db migration. green is reserved for the "drop"
// action, so no member is ever green.
export const MEMBERS = [
  { id: 'michael', name: 'Michael', color: '#C24B3A' }, // oxblood red
  { id: 'james',   name: 'James',   color: '#2E6E8E' }, // teal-blue
  { id: 'mzwu',    name: 'Mzwu',    color: '#7A4E86' }, // plum
  { id: 'liam',    name: 'Liam',    color: '#D89A3C' }, // amber
]

export const MEMBER_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.id, m]))

export const WHERE_OPTIONS = ['orz house', 'gc', 'dm', 'outside', 'other']
