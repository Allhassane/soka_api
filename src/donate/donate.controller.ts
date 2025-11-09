import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { DonateService } from './donate.service';
import { CreateDonateDto } from './dto/create-donate.dto';

@ApiTags('Don')
@Controller('donate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DonateController {
  constructor(private readonly donateService: DonateService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les dons' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Liste de toutes les dons' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  create(@Body() createDonateDto: CreateDonateDto, @Request() req) {
    console.log(createDonateDto);
    const admin_uuid = req.user.uuid as string;
    return this.donateService.create(createDonateDto, admin_uuid);
  }
}
