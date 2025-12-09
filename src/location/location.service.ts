import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { GOOGLE_MAPS_API_KEY } from 'src/shared/constants/constants';

export interface LocationResult {
  description: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class LocationService {
  constructor(private readonly httpService: HttpService) {}

  private readonly googleApiKey = GOOGLE_MAPS_API_KEY; 


  async searchLocation(query: string, country: string = 'CI'): Promise<LocationResult[]> {
    console.log(GOOGLE_MAPS_API_KEY);
    if (!query) return [];

    // 1️⃣ Autocomplétion Google Places
    const autocompleteUrl = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
    const autocompleteParams = {
      input: query,
      types: 'geocode|establishment',         // villes, quartiers, villages, lieux
      components: `country:${country}`,       // filtre par pays
      key: GOOGLE_MAPS_API_KEY,
      location: '7.54,-5.55',                 // centre approximatif Côte d’Ivoire
      radius: 500000,                          // 500 km
    };

    const autocompleteResp: AxiosResponse<any> = await firstValueFrom(
      this.httpService.get(autocompleteUrl, { params: autocompleteParams })
    );

    const predictions = autocompleteResp.data.predictions.slice(0, 20); // limiter à 20 résultats

    if (predictions.length === 0) return [];

    // Optimisation : récupérer les détails des coordonnées avec un seul appel batch si possible
    const results: LocationResult[] = [];

    for (const p of predictions) {
      const geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
      const geocodeParams = {
        place_id: p.place_id,
        key: this.googleApiKey,
      };

      const geoResp: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(geocodeUrl, { params: geocodeParams })
      );

      if (geoResp.data.results.length === 0) continue;

      const loc = geoResp.data.results[0].geometry.location;
      results.push({
        description: p.description,
        latitude: loc.lat,
        longitude: loc.lng,
      });
    }

    return results;
  }

  
}
