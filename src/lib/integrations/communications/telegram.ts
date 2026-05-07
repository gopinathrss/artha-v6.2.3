import axios from 'axios'

export async function telegramGetMe(botToken: string): Promise<{ ok: boolean; username?: string }> {
  const r = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 10_000 })
  return r.data
}
