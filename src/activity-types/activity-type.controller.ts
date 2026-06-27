import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityTypeService } from './activity-type.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';

@ApiBearerAuth()
@ApiTags('Activity Types')
@Controller('activity-types')
@UseGuards(JwtAuthGuard)
export class ActivityTypeController {
  constructor(private readonly service: ActivityTypeService) {}

  @Get()
  @ApiOperation({ summary: "Liste tous les types d'activité" })
  findAll(@Request() req) {
    return this.service.findAll(req.user.uuid as string);
  }

  @Post()
  @ApiOperation({ summary: "Créer un type d'activité" })
  store(@Body() payload: CreateActivityTypeDto, @Request() req) {
    return this.service.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: "Récupérer un type d'activité par UUID" })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.service.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid')
  @ApiOperation({ summary: "Modifier un type d'activité" })
  update(
    @Param('uuid') uuid: string,
    @Body() payload: UpdateActivityTypeDto,
    @Request() req,
  ) {
    return this.service.update(uuid, payload, req.user.uuid as string);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: "Supprimer un type d'activité" })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.service.delete(uuid, req.user.uuid as string);
  }
}
