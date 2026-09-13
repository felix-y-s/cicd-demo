import { Injectable } from '@nestjs/common';
import type { Post, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service.js';

/**
 * Posts Repository
 * 단일 테이블(Post) 접근 로직을 캡슐화한다
 */
@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PostCreateInput): Promise<Post> {
    return this.prisma.post.create({ data });
  }

  async findById(id: string): Promise<Post | null> {
    return this.prisma.post.findUnique({ where: { id } });
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    orderBy?: Prisma.PostOrderByWithRelationInput;
  }): Promise<Post[]> {
    const { skip, take, orderBy } = params;
    return this.prisma.post.findMany({
      skip,
      take,
      orderBy: orderBy ?? { createdAt: 'desc' },
    });
  }

  async count(): Promise<number> {
    return this.prisma.post.count();
  }

  async update(id: string, data: Prisma.PostUpdateInput): Promise<Post> {
    return this.prisma.post.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Post> {
    return this.prisma.post.delete({ where: { id } });
  }
}
