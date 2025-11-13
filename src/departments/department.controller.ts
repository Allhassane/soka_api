import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiBearerAuth()
@ApiTags('Departement')
@Controller('departement')
@UseGuards(JwtAuthGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les département' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.departmentService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau département' })
  @ApiResponse({ status: 200, description: 'Département créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateDepartmentDto, @Request() req) {
    return this.departmentService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un département par UUID' })
  @ApiResponse({ status: 200, description: 'Département trouvé.' })
  @ApiResponse({ status: 400, description: 'Département non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.departmentService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un département' })
 @ApiResponse({ status: 200, description: 'Département modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateDepartmentDto,
    ) {
    return this.departmentService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un département' })
  @ApiResponse({ status: 200, description: 'Département supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Département introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.departmentService.delete(uuid,admin_uuid);
  }
}
