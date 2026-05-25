import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { DonatesService } from './donates.service';
import { CreateDonateDto } from './dto/create-donate.dto';
import { UpdateDonateDto } from './dto/update-donate.dto';
import { Donate } from './entities/donate.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Controller('donates')
export class DonatesController {

  constructor(
    private readonly donatesService: DonatesService,
  ) { }

  @Get()
  findAll() {
    return this.donatesService.findAll();
  }

  @Post()
  create(@Body() createDonateDto: CreateDonateDto) {
    return this.donatesService.create(createDonateDto);
  }

  @Get(':uuid')
  findOne(@Param('uuid') uuid: string) {
    return this.donatesService.findOne(uuid);
  }

  @Patch(':uuid')
  update(
    @Param('uuid') uuid: string,
    @Body() updateDonateDto: UpdateDonateDto,
  ) {
    return this.donatesService.update(uuid, updateDonateDto);
  }

  @Delete(':uuid')
  remove(@Param('uuid') uuid: string) {
    return this.donatesService.remove(uuid);
  }

    @Patch(':uuid/:status')
  async toggleStatus(
    @Param('uuid') uuid: string,
    @Param('status') status: GlobalStatus,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.donatesService.updateStatus(uuid, status);

      if (result) {
        return {
          success: true,
          message: 'Statut de la campagne de don mis à jour avec succès',
        };
      } else {
        return {
          success: false,
          message: `Impossible de mettre à jour le statut de la campagne de don #${uuid}`,
        };
      }
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

}
