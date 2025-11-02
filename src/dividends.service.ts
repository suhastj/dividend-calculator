import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import axios from 'axios';

type CacheEntry = { expiresAtMs: number; data: unknown };

@Injectable()
export class DividendsService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs = 10 * 60 * 1000; // 10 minutes

  async getDividends(ticker: string, from?: string, to?: string) {
    if (!ticker) {
      throw new BadRequestException('ticker is required');
    }
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('FINNHUB_API_KEY env var is not set');
    }

    // Provide default date range if not supplied: last 5 years until today
    const today = new Date();
    const fiveYearsAgo = new Date(today);
    fiveYearsAgo.setFullYear(today.getFullYear() - 5);
    const toDate = to || this.formatDate(today);
    const fromDate = from || this.formatDate(fiveYearsAgo);

    const now = Date.now();
    const key = `${ticker}|${fromDate}|${toDate}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAtMs > now) {
      return cached.data;
    }

    // Finnhub dividends calendar endpoint
    const params: Record<string, string> = {
      token: apiKey,
      symbol: ticker,
      from: fromDate,
      to: toDate,
    };

    try {
      const url = 'https://finnhub.io/api/v1/calendar/dividends';
      const response = await axios.get(url, { params, timeout: 10000 });
      const data = response.data;
      this.cache.set(key, { expiresAtMs: now + this.defaultTtlMs, data });
      return data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        err?.response?.data || err?.message || 'Failed to fetch dividends',
      );
    }
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}


