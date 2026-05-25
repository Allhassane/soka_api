import { Controller, Get, Query } from '@nestjs/common';
import { LocationResult, LocationService } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {
    
  }

  @Get('search')
  async search(@Query('q') query: string): Promise<LocationResult[] | { error: string }> {
    if (!query || query.trim() === '') {
      return { error: 'Veuillez fournir un lieu à rechercher' };
    }

    // Appelle le service pour obtenir les suggestions avec coordonnées
    const results = await this.locationService.searchLocation(query.trim());

    return results;
  }
}
