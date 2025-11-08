import { Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { MemberResponsibilityService } from './⁠member-responsibility.service';

@ApiTags('Responsabilités Membre')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('member-responsibility')
export class MemberResponsibilityController {
  constructor(private readonly service: MemberResponsibilityService) {}
}
