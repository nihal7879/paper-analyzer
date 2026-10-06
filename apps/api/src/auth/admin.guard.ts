import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Admin login required');
    try {
      const payload = await this.jwt.verifyAsync<{ role?: string }>(token);
      if (payload.role !== 'admin') throw new Error('not admin');
      return true;
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
  }
}
