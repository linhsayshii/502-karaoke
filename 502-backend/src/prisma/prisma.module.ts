import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ReportPrismaService } from './report-prisma.service';

@Global()
@Module({
  providers: [PrismaService, ReportPrismaService],
  exports: [PrismaService, ReportPrismaService],
})
export class PrismaModule {}
