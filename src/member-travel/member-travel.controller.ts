import { Body, Controller, Delete, Get, Param, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { MemberTravelService } from './member-travel.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMemberTravelDto } from './dtos/create-member-travel.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Voyage Membres')
@ApiBearerAuth()
@Controller('member-travel')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberTravelController {
    constructor(private readonly memberTravelService: MemberTravelService) {}

    @Post()
    @RequirePermissions('membres_voyages_creer')
    @ApiOperation({ summary: 'Créer un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre créé avec succès.' })
    @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
    store(@Body() payload: CreateMemberTravelDto, @Request() req) {
        const admin_uuid = req.user.uuid as string;
        return this.memberTravelService.store(payload, admin_uuid);
    }

    @Get('member/:member_uuid')
    @RequirePermissions('membres_voyages_voir')
    @ApiOperation({ summary: 'Lister les voyages membres' })
    @ApiResponse({ status: 200, description: 'Liste des voyages membres.' })
    @ApiParam({ name: 'member_uuid', description: 'UUID du membre', required: true })
    findAll(@Param('member_uuid') member_uuid: string) {
        return this.memberTravelService.findAll(member_uuid);
    }

    @Get('find/:uuid')
    @RequirePermissions('membres_voyages_voir')
    @ApiOperation({ summary: 'Voir un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre trouvé.' })
    @ApiResponse({ status: 404, description: 'Voyage membre non trouvé.' })
    findOne(@Param('uuid') uuid: string) {
        return this.memberTravelService.findOne(uuid);
    }

    @Delete('delete/:uuid')
    @RequirePermissions('membres_voyages_supprimer')
    @ApiOperation({ summary: 'Supprimer un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre supprimé.' })
    @ApiResponse({ status: 404, description: 'Voyage membre non trouvé.' })
    delete(@Param('uuid') uuid: string) {
      console.log(uuid);
        return this.memberTravelService.delete(uuid);
    }
}
