import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller('csv')
export class CsvController {
  @Get()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="dividends.csv"')
  getCsv(@Res() res: Response) {
    const filePath = join(process.cwd(), 'src', 'data', 'dividends.csv');
    return res.sendFile(filePath);
  }
}


