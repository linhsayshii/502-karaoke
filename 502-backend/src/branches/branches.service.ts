import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  // Chain manager sees every branch; everyone else only their own.
  findAll(user: AuthUser) {
    return this.prisma.branch.findMany({
      where:
        user.role === Role.CHAIN_MANAGER
          ? undefined
          : { id: user.branchId ?? -1 },
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: CreateBranchDto) {
    const existing = await this.prisma.branch.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Mã cơ sở đã tồn tại');
    return this.prisma.branch.create({ data: dto });
  }

  update(id: number, dto: UpdateBranchDto) {
    return this.prisma.branch.update({ where: { id }, data: dto });
  }
}
