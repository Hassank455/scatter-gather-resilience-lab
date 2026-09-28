import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { HotelSearchController } from './hotel-search.controller';
import { SearchOrchestrator } from './search-orchestrator';

@Module({
  // The MODULE imports ProvidersModule to get HOTEL_PROVIDERS.
  // The orchestrator CODE still only knows the HotelProvider interface.
  imports: [ProvidersModule],
  controllers: [HotelSearchController],
  providers: [SearchOrchestrator],
})
export class HotelSearchModule {}
