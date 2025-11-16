import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MemberService } from './member.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { VerifyPhoneNumberDto } from './dto/verify-phone.dto';

@ApiBearerAuth()
@ApiTags('Membres')
@Controller('members')
@UseGuards(JwtAuthGuard)
export class MemberController {
  constructor(private readonly membreService: MemberService) {}

  @Get()
  @ApiOperation({ summary: 'Liste paginée des membres' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 15,
  ) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findAll(admin_uuid, Number(page), Number(limit));
  }


  @Get('structures')
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
  @ApiOperation({ summary: 'Récupérer tous les bénéficiaires en fonction du membre connecté par son UUID' })  
  @ApiResponse({ status: 200, description: 'Liste des bénéficiaires récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste des bénéficiaires non trouvée.' })
  findAllBeneficiaryByUserConnected(
    @Request() req,
  ) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findAllBeneficiaryByUserConnected(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un membre ' })
  @ApiResponse({ status: 200, description: 'Membre créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateMemberDto, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.store(payload, admin_uuid);
  }

  @Post('/verify/phone-number')
  @ApiOperation({ summary: 'Verifier si le numero de telephone est disponible ' })
  @ApiResponse({ status: 200, description: 'Numero de telephone disponible.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  @ApiBody({ type: VerifyPhoneNumberDto })
  verifyPhoneNumber(@Body() payload: VerifyPhoneNumberDto) {
    return this.membreService.verifyPhoneNumber(payload);
  }

  // @Post('/verify/email')
  // @ApiOperation({ summary: 'Verifier si le numero de telephone est disponible ' })
  // @ApiResponse({ status: 200, description: 'Numero de telephone disponible.' })
  // @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  // @ApiBody({ type: VerifyPhoneNumberDto })
  // verifyEmail(@Body() payload: VerifyEmailDto) {
  //   return this.membreService.verifyPhoneNumber(payload);
  // }

  

  @Get('by-structure/:uuid')
  @ApiOperation({ summary: 'Récupérer tous les membres d une structure par UUID' })
  @ApiResponse({ status: 200, description: 'Membres trouvés.' })
  @ApiResponse({ status: 400, description: 'Structure non trouvée.' })
  findByStructure(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findByStructure(uuid, admin_uuid);
  }


  @Get('find-list/:uuid')
  @ApiOperation({ summary: 'Récupérer tous les membres d une structure par UUID' })
  @ApiResponse({ status: 200, description: 'Membres trouvés.' })
  @ApiResponse({ status: 400, description: 'Structure non trouvée.' })
  findList(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.findList(uuid, admin_uuid);
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

  @Get('stats/global')
  @ApiOperation({ summary: 'Récupérer les stats globales des membres' })
  @ApiResponse({ status: 200, description: 'Stats globales des membres récupérées.' })
  @ApiResponse({ status: 400, description: 'Stats globales des membres non trouvées.' })
  getAllMemberStatsByUserConnected(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.membreService.getAllMemberStatsByUserConnected(admin_uuid);
  }

}
