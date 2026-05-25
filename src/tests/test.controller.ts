import { Controller, Get, BadRequestException } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SuccessMessage } from '../shared/decorators/success-message.decorator';

@ApiTags('Test')
@Controller()
export class TestController {
  @Get('test-success')
  @SuccessMessage('Récupération réussie')
  @ApiResponse({ status: 200, description: 'Test réussi' })
  getSuccess() {
    return { foo: 'bar' };
  }

  @Get('test-error')
  @ApiResponse({ status: 400, description: 'Erreur volontaire' })
  getError() {
    throw new BadRequestException(['Le champ X est requis']);
  }
}
