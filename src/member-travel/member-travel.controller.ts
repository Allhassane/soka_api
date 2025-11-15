import { Body, Controller, Delete, Get, Param, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { MemberTravelService } from './member-travel.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMemberTravelDto } from './dtos/create-member-travel.dto';

@ApiTags('Voyage Membres')
@ApiBearerAuth()
@Controller('member-travel')
@UseGuards(JwtAuthGuard)
export class MemberTravelController {
    constructor(private readonly memberTravelService: MemberTravelService) {}
    
    @Post()
    @ApiOperation({ summary: 'Créer un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre créé avec succès.' })
    @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
    store(@Body() payload: CreateMemberTravelDto, @Request() req) {
        const admin_uuid = req.user.uuid as string;
        return this.memberTravelService.store(payload, admin_uuid);
    }

    @Get('member/:member_uuid')
    @ApiOperation({ summary: 'Lister les voyages membres' })
    @ApiResponse({ status: 200, description: 'Liste des voyages membres.' })
    @ApiParam({ name: 'member_uuid', description: 'UUID du membre', required: true })
    findAll(@Param('member_uuid') member_uuid: string) {
        return this.memberTravelService.findAll(member_uuid);
    }

    @Get('find/:uuid')
    @ApiOperation({ summary: 'Voir un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre trouvé.' })
    @ApiResponse({ status: 404, description: 'Voyage membre non trouvé.' })
    findOne(@Param('uuid') uuid: string) {
        return this.memberTravelService.findOne(uuid);
    }

    @Delete('delete/:uuid')
    @ApiOperation({ summary: 'Supprimer un voyage membre' })
    @ApiResponse({ status: 200, description: 'Voyage membre supprimé.' })
    @ApiResponse({ status: 404, description: 'Voyage membre non trouvé.' })
    delete(@Param('uuid') uuid: string) {
        return this.memberTravelService.delete(uuid);
    }
}
