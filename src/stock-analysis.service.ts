import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFile, mkdir, readFile, access } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';

type DividendHistory = {
  exDividendDate: string;
  cashAmount: string;
  recordDate: string;
  payDate: string;
};

type CacheEntry = { expiresAtMs: number; data: DividendHistory[] };

@Injectable()
export class StockAnalysisService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs = 60 * 60 * 1000; // 1 hour

  /**
   * Converts date from "MMM DD, YYYY" format (e.g., "Oct 31, 2025") to "yyyy-MM-dd" format (e.g., "2025-10-31")
   */
  private formatDateToIso(dateStr: string): string {
    if (!dateStr || !dateStr.trim()) {
      return dateStr;
    }

    try {
      // Parse date string like "Oct 31, 2025" or "Sep 19, 2025"
      const date = new Date(dateStr.trim());
      if (isNaN(date.getTime())) {
        // If parsing fails, return original string
        return dateStr;
      }

      // Format as yyyy-MM-dd
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      // If any error occurs, return original string
      return dateStr;
    }
  }

  /**
   * Checks if a CSV file exists for the given ticker
   */
  private async csvExists(ticker: string, outputDir?: string): Promise<boolean> {
    try {
      const baseDir = outputDir 
        ? join(process.cwd(), outputDir)
        : join(process.cwd(), 'src', 'data');
      const filename = `${ticker.toLowerCase()}_dividends.csv`;
      const filePath = join(baseDir, filename);
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads existing CSV file and returns dividend history
   */
  private async readExistingCsv(ticker: string, outputDir?: string): Promise<DividendHistory[]> {
    try {
      const baseDir = outputDir 
        ? join(process.cwd(), outputDir)
        : join(process.cwd(), 'src', 'data');
      const filename = `${ticker.toLowerCase()}_dividends.csv`;
      const filePath = join(baseDir, filename);
      
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return [];
      }

      const dividends: DividendHistory[] = [];
      // Skip header (first line)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (handle quoted values)
        const values = this.parseCsvLine(line);
        if (values.length >= 4) {
          dividends.push({
            exDividendDate: values[0],
            cashAmount: values[1],
            recordDate: values[2],
            payDate: values[3],
          });
        }
      }

      return dividends;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parses a CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      values.push(current.trim());
    }

    return values;
  }

  /**
   * Merges new dividends with existing ones, keeping only new entries after the latest date
   * Returns merged list in descending order by ex-dividend date
   */
  private mergeDividends(existing: DividendHistory[], newData: DividendHistory[]): DividendHistory[] {
    if (existing.length === 0) {
      // Sort new data in descending order
      return newData.sort((a, b) => b.exDividendDate.localeCompare(a.exDividendDate));
    }

    // Get the latest ex-dividend date from existing data
    const latestExistingDate = existing[0].exDividendDate;

    // Filter new data to only include entries after the latest existing date
    const newerEntries = newData.filter(d => d.exDividendDate > latestExistingDate);

    // Combine and sort in descending order
    const merged = [...newerEntries, ...existing];
    return merged.sort((a, b) => b.exDividendDate.localeCompare(a.exDividendDate));
  }

  async getDividendHistory(ticker: string, outputDir?: string): Promise<DividendHistory[]> {
    if (!ticker) {
      throw new BadRequestException('ticker is required');
    }

    const tickerUpper = ticker.toUpperCase();
    const now = Date.now();
    const cached = this.cache.get(tickerUpper);
    if (cached && cached.expiresAtMs > now) {
      // If custom output directory is provided, save cached data to that directory
      if (outputDir) {
        await this.saveToCsv(tickerUpper, cached.data, outputDir);
      }
      return cached.data;
    }

    try {
      const url = `https://stockanalysis.com/etf/${ticker.toLowerCase()}/dividend/`;
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);
      const dividends: DividendHistory[] = [];

      // Find the dividend history table - stockanalysis.com uses a specific table structure
      // Look for table within div with class containing "table-wrap"
      $('div[class*="table-wrap"] table, .table-wrap table').each((_, table) => {
        const rows = $(table).find('tbody tr');
        if (rows.length === 0) return;

        rows.each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 4) {
            const exDividendDate = $(cells[0]).text().trim();
            const cashAmount = $(cells[1]).text().trim();
            const recordDate = $(cells[2]).text().trim();
            const payDate = $(cells[3]).text().trim();

            // Only add if we have valid data (ex-dividend date and cash amount)
            if (exDividendDate && cashAmount) {
              dividends.push({
                exDividendDate: this.formatDateToIso(exDividendDate),
                cashAmount,
                recordDate: this.formatDateToIso(recordDate),
                payDate: this.formatDateToIso(payDate),
              });
            }
          }
        });
      });

      // Fallback: try any table with tbody containing rows with date patterns
      if (dividends.length === 0) {
        $('table tbody tr').each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 4) {
            const exDividendDate = $(cells[0]).text().trim();
            const cashAmount = $(cells[1]).text().trim();
            const recordDate = $(cells[2]).text().trim();
            const payDate = $(cells[3]).text().trim();

            // Check if it looks like dividend data (has date and dollar amount)
            const hasDate = /[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/.test(exDividendDate);
            const hasAmount = /\$?\d+\.\d+/.test(cashAmount);

            if (hasDate && hasAmount) {
              dividends.push({
                exDividendDate: this.formatDateToIso(exDividendDate),
                cashAmount,
                recordDate: this.formatDateToIso(recordDate),
                payDate: this.formatDateToIso(payDate),
              });
            }
          }
        });
      }

      if (dividends.length === 0) {
        throw new InternalServerErrorException(
          'Could not find dividend history table on the page',
        );
      }

      // Check if CSV already exists
      const csvFileExists = await this.csvExists(tickerUpper, outputDir);
      let finalDividends: DividendHistory[];

      if (csvFileExists) {
        // Read existing CSV data
        const existingData = await this.readExistingCsv(tickerUpper, outputDir);
        // Merge with new data (only append entries after latest existing date)
        finalDividends = this.mergeDividends(existingData, dividends);
      } else {
        // No existing CSV, just sort new data in descending order
        finalDividends = dividends.sort((a, b) => b.exDividendDate.localeCompare(a.exDividendDate));
      }

      // Save to CSV file (with optional custom directory)
      await this.saveToCsv(tickerUpper, finalDividends, outputDir);

      this.cache.set(tickerUpper, { expiresAtMs: now + this.defaultTtlMs, data: finalDividends });
      return finalDividends;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof InternalServerErrorException) {
        throw err;
      }
      if (err?.response?.status === 404) {
        throw new BadRequestException(`ETF ticker "${ticker}" not found on stockanalysis.com`);
      }
      throw new InternalServerErrorException(
        err?.message || 'Failed to fetch dividend history from stockanalysis.com',
      );
    }
  }

  private async saveToCsv(ticker: string, dividends: DividendHistory[], outputDir?: string): Promise<void> {
    try {
      const baseDir = outputDir 
        ? join(process.cwd(), outputDir)
        : join(process.cwd(), 'src', 'data');
      await mkdir(baseDir, { recursive: true });

      const filename = `${ticker.toLowerCase()}_dividends.csv`;
      const filePath = join(baseDir, filename);

      // CSV header
      const header = 'Ex-Dividend Date,Cash Amount,Record Date,Pay Date\n';

      // CSV rows
      const rows = dividends.map((d) => {
        // Escape commas in values and wrap in quotes if needed
        const escapeCsv = (value: string) => {
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };

        return [
          escapeCsv(d.exDividendDate),
          escapeCsv(d.cashAmount),
          escapeCsv(d.recordDate),
          escapeCsv(d.payDate),
        ].join(',');
      });

      const csvContent = header + rows.join('\n');
      await writeFile(filePath, csvContent, 'utf-8');
    } catch (error: any) {
      // Log error but don't fail the request if file write fails
      console.error(`Failed to save CSV file for ${ticker}:`, error?.message);
    }
  }

  /**
   * Reads ticker list from CSV file's first column (skipping header)
   */
  async readTickersFromCsv(csvFilePath: string): Promise<string[]> {
    try {
      const filePath = join(process.cwd(), csvFilePath);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new BadRequestException('CSV file must have at least a header and one data row');
      }

      const tickers: string[] = [];
      
      // Skip header (first line) and process each line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by comma and get first column
        const columns = line.split(',');
        const ticker = columns[0]?.trim();
        
        if (ticker && ticker.length > 0) {
          tickers.push(ticker);
        }
      }

      return tickers;
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to read CSV file: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Processes all tickers from a CSV file and saves dividend history for each
   */
  async processTickersFromCsv(
    csvFilePath: string,
    outputDir: string,
  ): Promise<{ ticker: string; success: boolean; error?: string }[]> {
    const tickers = await this.readTickersFromCsv(csvFilePath);
    const results: { ticker: string; success: boolean; error?: string }[] = [];

    for (const ticker of tickers) {
      try {
        await this.getDividendHistory(ticker, outputDir);
        results.push({ ticker, success: true });
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error';
        results.push({ ticker, success: false, error: errorMsg });
        console.error(`Failed to process ticker ${ticker}:`, errorMsg);
      }
    }

    return results;
  }
}

