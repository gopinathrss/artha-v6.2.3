import axios from 'axios'

export async function fetchPairViaExchangeRateApi(
  apiKey: string,
  base: string,
  quote: string
): Promise<number | null> {
  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`
    const r = await axios.get(url, { timeout: 12_000 })
    const rate = r.data?.conversion_rate
    return typeof rate === 'number' && rate > 0 ? rate : null
  } catch {
    return null
  }
}
