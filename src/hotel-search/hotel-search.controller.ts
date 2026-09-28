import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SearchResponse } from './domain/search-response';
import { SearchOrchestrator } from './search-orchestrator';
import { parseSearchRequest } from './search-request.parser';

// HTTP layer only: parse the query, delegate, choose the status code.
@Controller('hotels')
export class HotelSearchController {
  constructor(private readonly orchestrator: SearchOrchestrator) {}

  // GET /hotels/search?city=Amman&checkIn=2026-10-01&checkOut=2026-10-03&guests=2
  @Get('search')
  async search(
    @Query() query: Record<string, unknown>,
  ): Promise<SearchResponse> {
    const response = await this.orchestrator.search(parseSearchRequest(query));

    // Project policy: if NO provider succeeded, this is an outage, not "no hotels".
    // Answer 503, but keep the same body so the client can still see why.
    // (An HTTP status code is an HTTP decision, so it lives here, not in the orchestrator.)
    const anySucceeded = response.providers.some(
      (provider) => provider.status === 'success',
    );
    if (!anySucceeded) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
