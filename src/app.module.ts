import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { CsvController } from './csv.controller';
import { DividendsController } from './dividends.controller';
import { DividendsService } from './dividends.service';
import { StockAnalysisService } from './stock-analysis.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, CsvController, DividendsController],
  providers: [DividendsService, StockAnalysisService],
})
export class AppModule {}
