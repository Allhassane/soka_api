import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { MemberResponsibilityService } from './⁠member-responsibility.service';
import { CreateMemberResponsibilityDto } from './dto/create-member-responsibility.dto';

@ApiTags('Responsabilités Membre')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('member-responsibility')
export class MemberResponsibilityController {
  constructor(private readonly service: MemberResponsibilityService) {}

  @Post()
  @ApiOperation({
    summary: 'Ajouter une responsabilité',
  })
  @ApiResponse({
    status: 201,
    description: 'Insertion effectuée avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Requête invalide - Données manquantes ou incorrectes',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public create(
    @Body() createMemberResponsibilityDto: CreateMemberResponsibilityDto,
    @Request() req,
  ) {
    return this.service.create(
      createMemberResponsibilityDto,
      req.user.uuid,
    );
  }
}
