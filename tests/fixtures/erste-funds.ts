export const ERSTE_FUNDS = [
  { isin: 'CZ0008472347', notationId: 'CZ0008472347-F46745396', name: 'Dynamic Mix', category: 'MIXED' },
  { isin: 'CZ0008472321', notationId: 'CZ0008472321-F46745394', name: 'Conservative Mix', category: 'MIXED' },
  { isin: 'CZ0008476280', notationId: 'CZ0008476280-F335620136', name: 'REICO Long Lease', category: 'REAL_ESTATE' },
  { isin: 'CZ0008472263', notationId: 'CZ0008472263-F45677989', name: 'Sporobond', category: 'BONDS' },
  { isin: 'CZ0008472230', notationId: 'CZ0008472230-F45677991', name: 'Corporate Bonds', category: 'BONDS' },
  { isin: 'CZ0008472271', notationId: 'CZ0008472271-F45677988', name: 'Sporoinvest', category: 'CASH' },
  { isin: 'CZ0008472305', notationId: 'CZ0008472305-F46745390', name: 'Akciový Mix', category: 'EQUITY' },
  { isin: 'CZ0008472248', notationId: 'CZ0008472248-F46745393', name: 'GLOBAL STOCKS FF', category: 'EQUITY' },
  { isin: 'CZ0008472404', notationId: 'CZ0008472404-F46745391', name: 'Top Stocks', category: 'EQUITY' },
  { isin: 'AT0000A10QN3', notationId: 'AT0000A10QN3-F84220020', name: 'Emerging Markets', category: 'EQUITY' },
  { isin: 'CZ0008475043', notationId: 'CZ0008475043-F187727369', name: 'Small Caps', category: 'EQUITY' }
] as const

export type ErsteFundRow = (typeof ERSTE_FUNDS)[number]
