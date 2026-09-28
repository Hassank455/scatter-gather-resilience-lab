import { Module } from '@nestjs/common';
import { HotelSearchModule } from './hotel-search/hotel-search.module';

@Module({
  imports: [HotelSearchModule],
})
export class AppModule {}
