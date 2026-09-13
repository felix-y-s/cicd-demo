import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
} from '../../common/exception/index.js';
import type { CreateUserDto } from '../auth/dto/create-user.dto.js';
import { UsersRepository } from './repositories/users.repository.js';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * 회원가입
   * @param dto 회원가입 정보
   * @returns 생성된 사용자
   * @throws EmailAlreadyExistsException 이메일 중복 시
   */
  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new EmailAlreadyExistsException();

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.usersRepository.create({
      email: dto.email,
      passwordHash,
    });
  }

  /**
   * 이메일/비밀번호 검증 — AuthService에서 호출
   * @param email 이메일
   * @param password 비밀번호 (평문)
   * @returns 사용자 객체
   * @throws InvalidCredentialsException 이메일 또는 비밀번호가 일치하지 않는 경우
   */
  async validateUser(email: string, password: string): Promise<User> {
    // 이메일 없음과 비밀번호 불일치를 동일한 예외로 응답 — 이메일 존재 여부 노출 방지
    const user = await this.usersRepository.findByEmail(email);
    if (!user) throw new InvalidCredentialsException();

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) throw new InvalidCredentialsException();

    return user;
  }
}
