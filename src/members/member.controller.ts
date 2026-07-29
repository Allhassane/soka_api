import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MemberService } from './member.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { VerifyPhoneNumberDto } from './dto/verify-phone.dto';

@ApiBearerAuth()
@ApiTags('Membres')
@Controller('members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberController {
  constructor(private readonly membreService: MemberService) {}

@Get()
@RequirePermissions('membres_voir_menu_liste_membres')
@ApiOperation({ summary: 'Liste paginée des membres' })
@ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
@ApiQuery({ name: 'page', required: false, type: Number })
@ApiQuery({ name: 'limit', required: false, type: Number })
@ApiQuery({ name: 'region_uuid', required: false, type: String })
@ApiQuery({ name: 'centre_uuid', required: false, type: String })
@ApiQuery({ name: 'chapitre_uuid', required: false, type: String })
@ApiQuery({ name: 'district_uuid', required: false, type: String })
@ApiQuery({ name: 'groupe_uuid', required: false, type: String })
@ApiQuery({ name: 'department_uuid', required: false, type: String })
@ApiQuery({ name: 'division_uuid', required: false, type: String })
async findAll(
  @Request() req,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 15,
  @Query('region_uuid') region_uuid?: string,
  @Query('centre_uuid') centre_uuid?: string,
  @Query('chapitre_uuid') chapitre_uuid?: string,
  @Query('district_uuid') district_uuid?: string,
  @Query('groupe_uuid') groupe_uuid?: string,
  @Query('department_uuid') department_uuid?: string,
  @Query('division_uuid') division_uuid?: string,
) {
  const admin_uuid = req.user.uuid as string;
  return this.membreService.findAll(admin_uuid, Number(page), Number(limit), {
    region_uuid,
    centre_uuid,
    chapitre_uuid,
    district_uuid,
    groupe_uuid,
    department_uuid,
    division_uuid,
  });
}

  @Get('structures')
  @RequirePermissions('membres_voir_menu_liste_membres')
  @ApiOperation({ summary: 'Récupérer tous les membres en fonction du user connecté par son UUID' })
  @ApiResponse({ status: 200, description: 'Liste des membres récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste des membres non trouvée.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page actuelle', default: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', default: 15 })
  findAllMemberByUserConnected(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 15,
  ) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findAllMemberByUserConnected(admin_uuid, Number(page), Number(limit));
  }

  @Get('beneficiary')
  @RequirePermissions('membres_voir_menu_liste_membres')
  @ApiOperation({ summary: 'Récupérer tous les bénéficiaires en fonction du membre connecté par son UUID' })
  @ApiResponse({ status: 200, description: 'Liste des bénéficiaires récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste des bénéficiaires non trouvée.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAllBeneficiaryByUserConnected(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findAllBeneficiaryByUserConnected(
      admin_uuid,
      page != null ? Number(page) : undefined,
      limit != null ? Number(limit) : undefined,
      search,
    );
  }

  @Post()
  @RequirePermissions('membres_ajouter_un_membre')
  @ApiOperation({ summary: 'Créer un membre ' })
  @ApiResponse({ status: 200, description: 'Membre créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateMemberDto, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.store(payload, admin_uuid);
  }

  @Post('/verify/phone-number')
  @RequirePermissions('membres_ajouter_un_membre')
  @ApiOperation({ summary: 'Verifier si le numero de telephone est disponible ' })
  @ApiResponse({ status: 200, description: 'Numero de telephone disponible.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  @ApiBody({ type: VerifyPhoneNumberDto })
  verifyPhoneNumber(@Body() payload: VerifyPhoneNumberDto) {
    return this.membreService.verifyPhoneNumber(payload);
  }

  @Get('by-structure/:uuid')
  @RequirePermissions('membres_voir_menu_liste_membres')
  @ApiOperation({ summary: 'Récupérer tous les membres d une structure par UUID' })
  @ApiResponse({ status: 200, description: 'Membres trouvés.' })
  @ApiResponse({ status: 400, description: 'Structure non trouvée.' })
  findByStructure(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findByStructure(uuid, admin_uuid);
  }


  @Get(':uuid')
  @RequirePermissions('membres_acceder_alonglet_membre')
  @ApiOperation({ summary: 'Récupérer un membre par UUID' })
  @ApiResponse({ status: 200, description: 'Membre trouvé.' })
  @ApiResponse({ status: 400, description: 'Membre non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('membres_modifier_un_membre')
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
  @RequirePermissions('membres_supprimer_un_membre')
  @ApiOperation({ summary: 'Supprimer un membre' })
  @ApiResponse({ status: 200, description: 'Membre supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Membre introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.delete(uuid,admin_uuid);
  }

  //
  @Get('stat-by-structure/:uuid')
  @RequirePermissions('membres_voir_menu_liste_membres')
  @ApiOperation({ summary: 'Récupérer tous les statistiques des membres d une structure par UUID' })
  @ApiResponse({ status: 200, description: 'Statistiques sur les membres trouvés.' })
  @ApiResponse({ status: 400, description: 'Structure non trouvée.' })
  getStatsByStructure(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.getStatsByStructure(uuid, admin_uuid);
  }

}
