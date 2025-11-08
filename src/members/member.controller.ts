import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MemberService } from './member.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiBearerAuth()
@ApiTags('Membres')
@Controller('members')
@UseGuards(JwtAuthGuard)
export class MemberController {
  constructor(private readonly membreService: MemberService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les membres ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un membre ' })
  @ApiResponse({ status: 200, description: 'Membre créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateMemberDto, @Request() req) {
    return this.membreService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un membre par UUID' })
  @ApiResponse({ status: 200, description: 'Membre trouvé.' })
  @ApiResponse({ status: 400, description: 'Membre non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un membre' })
 @ApiResponse({ status: 200, description: 'Membre modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateMemberDto,
    ) {
    return this.membreService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un membre' })
  @ApiResponse({ status: 200, description: 'Membre supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Membre introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.delete(uuid,admin_uuid);
  }
}
