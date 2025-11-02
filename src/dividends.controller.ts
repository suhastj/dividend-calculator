import { Controller, Get, Param, Query } from '@nestjs/common';
import { DividendsService } from './dividends.service';
import { StockAnalysisService } from './stock-analysis.service';

@Controller('dividends')
export class DividendsController {
  constructor(
    private readonly dividendsService: DividendsService,
    private readonly stockAnalysisService: StockAnalysisService,
  ) {}

  // GET /dividends/batch/yieldmax-other - Process all tickers from yieldMax_Weekly_Dividend_ETFs-Other.csv
  // Must come before :ticker route to avoid route conflict
  @Get('batch/yieldmax-other')
  async processYieldMaxOther() {
    const csvFilePath = 'src/data/yieldMax_Weekly_Dividend_ETFs-Other.csv';
    const outputDir = 'src/data/yieldmax/other';
    return this.stockAnalysisService.processTickersFromCsv(csvFilePath, outputDir);
  }

  // GET /dividends/batch/yieldmax-single-stock - Process all tickers from yieldMax_Weekly_Dividend_ETFs-Single_Stock_Option_Income.csv
  // Must come before :ticker route to avoid route conflict
  @Get('batch/yieldmax-single-stock')
  async processYieldMaxSingleStock() {
    const csvFilePath = 'src/data/yieldMax_Weekly_Dividend_ETFs-Single_Stock_Option_Income.csv';
    const outputDir = 'src/data/yieldmax/single_stock_option';
    return this.stockAnalysisService.processTickersFromCsv(csvFilePath, outputDir);
  }

  // GET /dividends/batch/yieldmax-short-single-stock - Process all tickers from yieldMax_Weekly_Dividend_ETFs-Short_Single_Stock_Option_Income.csv
  // Must come before :ticker route to avoid route conflict
  @Get('batch/yieldmax-short-single-stock')
  async processYieldMaxShortSingleStock() {
    const csvFilePath = 'src/data/yieldMax_Weekly_Dividend_ETFs-Short_Single_Stock_Option_Income.csv';
    const outputDir = 'src/data/yieldmax/short_single_stock_option';
    return this.stockAnalysisService.processTickersFromCsv(csvFilePath, outputDir);
  }

  // GET /dividends/:ticker/stockanalysis - Scrapes stockanalysis.com for dividend history
  // Must come before :ticker route to avoid route conflict
  @Get(':ticker/stockanalysis')
  async getStockAnalysis(@Param('ticker') ticker: string) {
    return this.stockAnalysisService.getDividendHistory(ticker);
  }

  // GET /dividends/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD
  @Get(':ticker')
  async get(@Param('ticker') ticker: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dividendsService.getDividends(ticker, from, to);
  }
}


