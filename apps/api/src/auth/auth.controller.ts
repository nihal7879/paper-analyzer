import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Phase 0: single shared admin password from .env. Becomes per-user login with roles in Phase 1. */
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { password?: unknown }) {
    const given = typeof body?.password === 'string' ? body.password : '';
    if (!safeEqual(given, this.config.get('ADMIN_PASSWORD', { infer: true }))) {
      throw new UnauthorizedException('Wrong password');
    }
    const token = await this.jwt.signAsync({ sub: 'admin', role: 'admin' });
    return { token, role: 'admin' };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
