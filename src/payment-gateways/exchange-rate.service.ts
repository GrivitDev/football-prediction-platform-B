import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface FrankfurterRateResponse {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

@Injectable()
export class ExchangeRateService {
  private readonly apiUrl =
    'https://api.frankfurter.dev/v2/rate/USD/NGN?providers=CBN';

  // Refresh the rate every 30 minutes.
  private readonly cacheDurationMs = 30 * 60 * 1000;

  // Do not use a stale cached rate beyond this period.
  private readonly maxStaleDurationMs = 24 * 60 * 60 * 1000;

  private cachedRate: number | null = null;

  private cachedAt: number | null = null;

  // =====================================================
  // GET USD → NGN RATE
  // =====================================================

  async getUsdToNgnRate(): Promise<number> {
    const now = Date.now();

    // ===================================================
    // RETURN FRESH CACHED RATE
    // ===================================================

    if (
      this.cachedRate !== null &&
      this.cachedAt !== null &&
      now - this.cachedAt < this.cacheDurationMs
    ) {
      return this.cachedRate;
    }

    // ===================================================
    // FETCH CURRENT CBN RATE
    // ===================================================

    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',

        headers: {
          Accept: 'application/json',
        },

        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Frankfurter returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as FrankfurterRateResponse;

      // =================================================
      // VALIDATE RESPONSE
      // =================================================

      if (data.base !== 'USD' || data.quote !== 'NGN') {
        throw new Error('Frankfurter returned an unexpected currency pair.');
      }

      const rate = Number(data.rate);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Frankfurter returned an invalid exchange rate.');
      }

      // =================================================
      // CACHE SUCCESSFUL RATE
      // =================================================

      this.cachedRate = rate;

      this.cachedAt = now;

      console.log(
        `[ExchangeRateService] USD/NGN rate updated: ${rate} (${data.date})`,
      );

      return rate;
    } catch (error) {
      console.error(
        '[ExchangeRateService] Failed to fetch USD/NGN rate:',
        error,
      );

      // =================================================
      // FALLBACK TO RECENT CACHED RATE
      // =================================================

      if (
        this.cachedRate !== null &&
        this.cachedAt !== null &&
        now - this.cachedAt < this.maxStaleDurationMs
      ) {
        console.warn(
          `[ExchangeRateService] Using cached USD/NGN rate: ${this.cachedRate}`,
        );

        return this.cachedRate;
      }

      // =================================================
      // NO SAFE RATE AVAILABLE
      // =================================================

      throw new ServiceUnavailableException(
        'We are currently unable to determine the USD to NGN exchange rate. Please try again shortly.',
      );
    }
  }

  // =====================================================
  // CONVERT USD → NGN
  // =====================================================

  async convertUsdToNgn(amountUsd: number): Promise<{
    amount: number;
    rate: number;
  }> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new ServiceUnavailableException('Invalid USD amount.');
    }

    const rate = await this.getUsdToNgnRate();

    const amountNgn = Math.round(amountUsd * rate);

    return {
      amount: amountNgn,

      rate,
    };
  }
}
