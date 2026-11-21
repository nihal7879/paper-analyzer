import { Body, Controller, Get, HttpCode, Module, Post, Put, UseGuards } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { SettingsService } from './settings.service.js';

/** Admin: AI settings (which AI is used, keys and models). */
@Controller('settings')
@UseGuards(AdminGuard)
class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('ai')
  ai() {
    return this.settings.status();
  }

  /** { provider?: 'claude' | 'openai' | 'gemini' | 'mock', keys?: { claude?, openai?, gemini? }, models?: {…} } */
  @Put('ai')
  update(@Body() body: unknown) {
    return this.settings.update(body);
  }

  /** { provider } — check the saved key with a free call */
  @Post('ai/test')
  @HttpCode(200)
  test(@Body() body: unknown) {
    return this.settings.testKey(body);
  }
}

@Module({
  imports: [AiModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
